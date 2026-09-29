-- =====================================================================
--  Mantenimiento de calles (docs/05-reglas-y-parametros.md §18): un estado
--  por barrio, de 0 a 100, que se gasta solo y que sostienen los vecinos con
--  jornada y ladrillo. Sin tabla nueva: dos columnas en barrios.
--
--  El desgaste es perezoso, como la producción: se guarda el estado y cuándo,
--  y el de ahora se calcula al leerlo (fx_streets_state). Ningún job lo resta.
-- =====================================================================

-- Claves nuevas de la config (§14).
update cities set config = config || '{"streets": {"initial": 100, "decay_per_day": 10, "points": 4,
                                                   "cost": {"ladrillo": 10}, "max_per_player_per_day": 1}}'::jsonb
 where not config ? 'streets';

-- Estado guardado y desde cuándo. El reloj es NULL mientras el barrio está cerrado:
-- sus calles no se gastan. Los barrios que ya están abiertos arrancan ahora, en el inicial.
alter table barrios add column streets_state numeric check (streets_state between 0 and 100),
                    add column streets_updated_at timestamptz;
update barrios b set streets_state = (c.config #>> '{streets,initial}')::numeric,
                     streets_updated_at = case when b.status = 'abierto' then now() end
  from cities c where c.id = b.city_id;
alter table barrios alter column streets_state set not null;

-- ---------------------------------------------------------------------
-- Estado de ahora: el guardado menos el desgaste desde entonces, sin bajar de 0.
-- El espejo del cliente está en web/src/game/streets.ts.
-- ---------------------------------------------------------------------
create or replace function fx_streets_state(p_barrio_id uuid) returns numeric
language sql stable set search_path = public as $$
  select case when b.streets_updated_at is null then b.streets_state
              else greatest(0, b.streets_state - (c.config #>> '{streets,decay_per_day}')::numeric
                                                 * extract(epoch from (now() - b.streets_updated_at)) / 86400.0)
         end
    from barrios b join cities c on c.id = b.city_id
   where b.id = p_barrio_id;
$$;

-- ---------------------------------------------------------------------
-- Atractivo (§16.2): el factor calles deja de valer 1 y pasa a ser estado ÷ 100.
-- El resto queda como en la migración del residencial.
-- ---------------------------------------------------------------------
create or replace function fx_barrio_attractiveness(p_barrio_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  b barrios; cfg jsonb; w jsonb; factors jsonb; k text;
  f_lotes numeric; f_calles numeric; f_abast numeric; f_obra numeric;
  supply numeric; total numeric := 0; weights numeric := 0; loss numeric; worst numeric := 0; reason text;
begin
  select * into b from barrios where id = p_barrio_id;
  if not found then return null; end if;
  cfg := fx_config(b.city_id);
  w := cfg #> '{citizens,weights}';

  -- Lotes: que los vecinos estén. Sin lotes con dueño no hay a quién extrañar.
  select coalesce(avg((cfg #>> ('{production,state_factor,' || l.state || '}')::text[])::numeric), 1)
    into f_lotes from lots l where l.barrio_id = b.id and l.owner_id is not null;

  -- Calles: que estén mantenidas (§18).
  f_calles := fx_streets_state(b.id) / 100;

  -- Abastecimiento: lo que produce el barrio por día contra lo que consume su gente.
  -- Es solo una medida: no se le descuenta nada a nadie.
  if b.population = 0 then
    f_abast := 1;
  else
    select coalesce(sum(fx_lot_rate(l)), 0) * 24 into supply
      from lots l where l.barrio_id = b.id and l.level > 0 and l.building_type <> 'residencial';
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
-- Apertura: la población arranca en 0 y las calles en el inicial, con el reloj en marcha.
-- ---------------------------------------------------------------------
create or replace function admin_open_barrio(p_barrio_id uuid, p_reason text default 'admin') returns void
language plpgsql security definer set search_path = public as $$
declare b barrios;
begin
  select * into b from barrios where id = p_barrio_id and status = 'cerrado' for update;
  if not found then return; end if;
  update barrios set status = 'abierto', opened_at = now(), population = 0,
                     streets_state = (fx_config(b.city_id) #>> '{streets,initial}')::numeric, streets_updated_at = now()
   where id = b.id;
  update lots set status = 'libre' where barrio_id = b.id and status = 'cerrado';
  perform fx_log_event(b.city_id, 'barrio.opened', null, null, null, jsonb_build_object('barrio_id', b.id, 'name', b.name, 'reason', p_reason));
  insert into notifications_outbox(player_id, type, payload)
  select id, 'barrio.opened', jsonb_build_object('name', b.name) from players where city_id = b.city_id;
end $$;

-- ---------------------------------------------------------------------
-- maintain_streets (docs/06): 1 jornada y streets.cost por streets.points, con tope
-- de 100. Cualquier barrio abierto de la ciudad, propio o ajeno; uno por jugador, por
-- barrio y por día del juego, contado en los eventos. Cuenta como jornada colectiva.
-- ---------------------------------------------------------------------
create or replace function maintain_streets(p_barrio_id uuid) returns barrios
language plpgsql security definer set search_path = public as $$
declare me players; b barrios; c cities; cfg jsonb; cost jsonb; state numeric; after numeric; done int;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into b from barrios where id = p_barrio_id for update;
  if not found or b.city_id <> me.city_id then raise exception 'OTHER_CITY'; end if;
  select * into c from cities where id = b.city_id;
  cfg := c.config;

  -- Se muestra redondeado: si lo que se ve ya es 100, no hay nada que mantener.
  state := fx_streets_state(b.id);
  if b.status <> 'abierto' or round(state) >= 100 then raise exception 'STREETS_FULL'; end if;

  select count(*) into done from events e
   where e.city_id = c.id and e.type = 'streets.maintained' and e.actor_id = me.id
     and e.payload->>'barrio_id' = b.id::text
     and (e.created_at at time zone c.timezone)::date = fx_now_local(c.id)::date;
  if done >= (cfg #>> '{streets,max_per_player_per_day}')::int then raise exception 'STREETS_DONE_TODAY'; end if;

  cost := cfg #> '{streets,cost}';
  perform fx_spend_jornada(me.id);
  perform fx_spend_materials(me.id, coalesce((cost->>'ladrillo')::int, 0), coalesce((cost->>'madera')::int, 0),
                             coalesce((cost->>'energia')::int, 0));

  after := least(100, state + (cfg #>> '{streets,points}')::numeric);
  update barrios set streets_state = after, streets_updated_at = now() where id = b.id returning * into b;

  perform fx_log_event(c.id, 'streets.maintained', me.id, null, null, jsonb_build_object(
    'barrio_id', b.id, 'points', round(after - state, 2), 'state', round(after, 2)));
  return b;
end $$;

-- ---------------------------------------------------------------------
-- Mapa de la invitación: suma el estado de las calles de ahora, para dibujarlas.
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
                  'population', b.population, 'streets', round(fx_streets_state(b.id), 2))), '[]'::jsonb)
                from barrios b where b.city_id = c.id),
    'works', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', w.id, 'barrio_id', w.barrio_id, 'name', w.name, 'x', w.x, 'y', w.y,
                'cost', w.cost, 'progress', w.progress, 'status', w.status)), '[]'::jsonb)
              from public_works w where w.city_id = c.id)
  )
  from invitations i join cities c on c.id = i.city_id
  where i.token = p_token and i.used_by is null and i.expires_at > now();
$$;

-- Permisos. Las funciones nuevas nacen con EXECUTE para PUBLIC (ver permisos_build):
-- maintain_streets es del contrato y la ejecuta authenticated; fx_streets_state es interna.
revoke all on function fx_streets_state(uuid), maintain_streets(uuid) from public, anon, authenticated;
grant execute on function maintain_streets(uuid) to authenticated;
