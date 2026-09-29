-- =====================================================================
--  Ciudadanos (docs/05-reglas-y-parametros.md §16): una población por barrio
--  que se mueve una vez por día hacia capacidad × atractivo, y una tercera vía
--  para abrir el Barrio 2. Sin tabla nueva: una columna en barrios.
--
--  El factor calles vale 1 hasta que exista el mantenimiento (§18), y la
--  capacidad es de 10 por lote hasta que exista el residencial (§17).
-- =====================================================================

alter table barrios add column population int not null default 0 check (population >= 0);

-- Claves nuevas de la config (§14).
update cities set config = jsonb_set(
  config || '{"citizens": {"capacity_per_lot": 10, "consumption_per_day": 2,
                           "weights": {"lotes": 0.3, "calles": 0.3, "abastecimiento": 0.3, "obra": 0.1},
                           "arrival_rate": 0.30, "departure_rate": 0.15}}'::jsonb,
  '{barrio,open_population}', '300');

-- ---------------------------------------------------------------------
-- Capacidad (§16.1): lo que alojan los lotes con edificio de nivel 1 o más.
-- Durante una mejora cuenta el nivel anterior, que es el que tiene el lote.
-- ---------------------------------------------------------------------
create or replace function fx_barrio_capacity(p_barrio_id uuid) returns int
language sql stable set search_path = public as $$
  select coalesce(sum((c.config #>> '{citizens,capacity_per_lot}')::int), 0)::int
    from lots l join cities c on c.id = l.city_id
   where l.barrio_id = p_barrio_id and l.level > 0;
$$;

-- ---------------------------------------------------------------------
-- Atractivo (§16.2): promedio ponderado de cuatro factores entre 0 y 1.
-- Devuelve {attractiveness, factors: {lotes, calles, abastecimiento, obra}, main_reason}.
-- El motivo principal es el factor que más resta (peso × (1 − factor)); si empatan,
-- el primero en ese orden, y si ninguno resta, null. El espejo del cliente está en
-- web/src/game/citizens.ts y redondea igual.
-- ---------------------------------------------------------------------
create or replace function fx_barrio_attractiveness(p_barrio_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  b barrios; cfg jsonb; w jsonb; factors jsonb; k text;
  f_lotes numeric; f_calles numeric := 1; f_abast numeric; f_obra numeric;
  supply numeric; total numeric := 0; weights numeric := 0; loss numeric; worst numeric := 0; reason text;
begin
  select * into b from barrios where id = p_barrio_id;
  if not found then return null; end if;
  cfg := fx_config(b.city_id);
  w := cfg #> '{citizens,weights}';

  -- Lotes: que los vecinos estén. Sin lotes con dueño no hay a quién extrañar.
  select coalesce(avg((cfg #>> ('{production,state_factor,' || l.state || '}')::text[])::numeric), 1)
    into f_lotes from lots l where l.barrio_id = b.id and l.owner_id is not null;

  -- Abastecimiento: lo que produce el barrio por día contra lo que consume su gente.
  -- Es solo una medida: no se le descuenta nada a nadie.
  if b.population = 0 then
    f_abast := 1;
  else
    select coalesce(sum(fx_effective_rate(l)), 0) * 24 into supply
      from lots l where l.barrio_id = b.id and l.level > 0;
    f_abast := least(1, supply / (b.population * (cfg #>> '{citizens,consumption_per_day}')::numeric));
  end if;

  -- Obra: 0 mientras la del barrio esté en curso.
  f_obra := case when exists (select 1 from public_works pw where pw.barrio_id = b.id and pw.status = 'en_curso')
                 then 0 else 1 end;

  factors := jsonb_build_object('lotes', round(f_lotes, 4), 'calles', round(f_calles, 4),
                                'abastecimiento', round(f_abast, 4), 'obra', round(f_obra, 4));
  foreach k in array array['lotes', 'calles', 'abastecimiento', 'obra'] loop
    total := total + (w->>k)::numeric * (factors->>k)::numeric;
    weights := weights + (w->>k)::numeric;
    loss := (w->>k)::numeric * (1 - (factors->>k)::numeric);
    if loss > worst then worst := loss; reason := k; end if;
  end loop;

  return jsonb_build_object('attractiveness', round(total / weights, 4), 'factors', factors, 'main_reason', reason);
end $$;

-- ---------------------------------------------------------------------
-- Población (§16.3). Diario a las 00:20, después de update_lot_states.
-- Idempotente: un evento barrio.population_changed por barrio abierto y por
-- día del juego, aunque no cambie nada, como jornadas.refilled.
-- ---------------------------------------------------------------------
create or replace function job_update_population() returns void
language plpgsql security definer set search_path = public as $$
declare c cities; b barrios; today date; cap int; attr jsonb; target int; before int; after int;
begin
  perform pg_advisory_xact_lock(hashtext('job_update_population'));
  for c in select * from cities loop
    today := fx_now_local(c.id)::date;
    for b in select * from barrios where city_id = c.id and status = 'abierto' order by ordinal for update loop
      continue when exists (select 1 from events
                             where city_id = c.id and type = 'barrio.population_changed'
                               and payload->>'barrio_id' = b.id::text and payload->>'day' = today::text);
      cap := fx_barrio_capacity(b.id);
      attr := fx_barrio_attractiveness(b.id);
      target := floor(cap * (attr->>'attractiveness')::numeric);
      before := b.population;
      if before < target then
        after := before + ceil((target - before) * (c.config #>> '{citizens,arrival_rate}')::numeric);
      elsif before > target then
        after := before - ceil((before - target) * (c.config #>> '{citizens,departure_rate}')::numeric);
      else
        after := before;
      end if;
      after := greatest(0, least(after, cap));

      update barrios set population = after where id = b.id;
      perform fx_log_event(c.id, 'barrio.population_changed', null, null, null, jsonb_build_object(
        'barrio_id', b.id, 'day', today, 'from', before, 'to', after, 'target', target, 'capacity', cap,
        'attractiveness', attr->'attractiveness', 'factors', attr->'factors', 'main_reason', attr->'main_reason'));
    end loop;
  end loop;

  -- La población pudo llegar a la de apertura: no se espera a la próxima hora.
  perform job_check_barrio_opening();
end $$;

-- ---------------------------------------------------------------------
-- Apertura del Barrio 2 (§8 y §16.4): la población es la primera vía que se mira.
-- ---------------------------------------------------------------------
create or replace function job_check_barrio_opening() returns void
language plpgsql security definer set search_path = public as $$
declare c cities; b barrios; total int; taken int; ratio numeric; people int;
begin
  for c in select * from cities loop
    select * into b from barrios where city_id = c.id and status = 'cerrado' order by ordinal limit 1;
    if not found then continue; end if;
    select count(*), count(*) filter (where status = 'ocupado') into total, taken
      from lots where city_id = c.id and barrio_id in (select id from barrios where city_id = c.id and status = 'abierto');
    ratio := case when total = 0 then 0 else taken::numeric / total end;
    select coalesce(sum(population), 0) into people from barrios where city_id = c.id and status = 'abierto';
    if people >= (c.config #>> '{barrio,open_population}')::int then
      perform admin_open_barrio(b.id, 'population');
    elsif ratio >= (c.config #>> '{barrio,open_threshold}')::numeric then
      perform admin_open_barrio(b.id, 'threshold');
    elsif now() >= c.opened_at + make_interval(days => (c.config #>> '{barrio,open_after_days}')::int) then
      perform admin_open_barrio(b.id, 'time');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Resumen (§11): suma la población del barrio propio.
-- ---------------------------------------------------------------------
create or replace function get_summary(p_since timestamptz) returns setof events
language sql security definer set search_path = public stable as $$
  select e.* from events e, players me, cities c
   where me.id = auth.uid() and c.id = me.city_id and e.city_id = me.city_id and e.created_at > p_since
     and (
       e.target_player_id = me.id
       or e.type in ('public_work.contributed','public_work.completed','barrio.opened')
       or (e.type = 'barrio.population_changed' and e.payload->>'barrio_id' = (
            select l.barrio_id::text from lots l where l.owner_id = me.id))
       or (e.type = 'player.joined' and e.actor_id <> me.id and exists (
            select 1 from lots a, lots b where a.owner_id = me.id and b.id = e.lot_id
               and abs(a.x-b.x)+abs(a.y-b.y) <= (c.config #>> '{lots,max_claim_distance}')::int))
     )
   order by e.created_at;
$$;

-- ---------------------------------------------------------------------
-- Mapa de la invitación: suma la población, para dibujar la gente de cada barrio.
-- ---------------------------------------------------------------------
create or replace function invitation_map(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'timezone', c.timezone,
    'palette', c.config -> 'palette',
    'max_claim_distance', (c.config #>> '{lots,max_claim_distance}')::int,
    'lots', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'barrio_id', l.barrio_id, 'x', l.x, 'y', l.y, 'status', l.status,
               'name', l.name, 'color', l.color, 'building_type', l.building_type,
               'level', l.level, 'state', l.state)), '[]'::jsonb)
             from lots l where l.city_id = c.id),
    'barrios', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', b.id, 'name', b.name, 'ordinal', b.ordinal, 'status', b.status,
                  'population', b.population)), '[]'::jsonb)
                from barrios b where b.city_id = c.id),
    'works', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', w.id, 'barrio_id', w.barrio_id, 'name', w.name, 'x', w.x, 'y', w.y,
                'cost', w.cost, 'progress', w.progress, 'status', w.status)), '[]'::jsonb)
              from public_works w where w.city_id = c.id)
  )
  from invitations i join cities c on c.id = i.city_id
  where i.token = p_token and i.used_by is null and i.expires_at > now();
$$;

-- Internas: nadie de afuera las ejecuta.
revoke all on function fx_barrio_capacity(uuid), fx_barrio_attractiveness(uuid), job_update_population()
  from public, anon, authenticated;

-- Cron (UTC). 00:20 hora Argentina = 03:20 UTC.
select cron.schedule('update_population', '20 3 * * *', $$select public.job_update_population()$$);
