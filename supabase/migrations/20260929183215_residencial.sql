-- =====================================================================
--  Residencial (docs/05-reglas-y-parametros.md §17): quinto tipo de edificio.
--  Aloja 30 / 60 / 100 ciudadanos y cobra alquiler en el material que elige
--  el dueño, a la tasa de §3 × el atractivo del barrio. Sin tabla nueva: un
--  valor del enum y una columna en lots.
--
--  El valor nuevo del enum no se usa en esta migración más que dentro de
--  funciones plpgsql, que se planifican al ejecutarse: así sirve aunque la
--  migración corra en una sola transacción.
-- =====================================================================

alter type building_t add value if not exists 'residencial';

-- Material del alquiler. Lo fija build al iniciar el nivel 1 y no cambia; NULL en los demás tipos.
alter table lots add column rent_material material_t;

-- Claves nuevas de la config (§14).
update cities set config = jsonb_set(jsonb_set(
  config || '{"residential": {"capacity_by_level": {"1": 30, "2": 60, "3": 100}}}'::jsonb,
  '{buildings,types}', (config #> '{buildings,types}') || '["residencial"]'::jsonb),
  '{buildings,produces,residencial}', 'null'::jsonb)
 where not (config #> '{buildings,types}') ? 'residencial';

-- ---------------------------------------------------------------------
-- Tasa de §3 (unidades/hora): base × plazas × obra × estado. Es la que mide el
-- abastecimiento, así que no depende del atractivo. El residencial rinde la tasa
-- base de su nivel, como cualquier edificio; la plaza no produce.
-- ---------------------------------------------------------------------
create or replace function fx_lot_rate(p_lot lots) returns numeric
language plpgsql stable set search_path = public as $$
declare cfg jsonb; base numeric; plazas int; bonus numeric; work_bonus numeric := 1.0; st_factor numeric;
begin
  if p_lot.level = 0 or p_lot.building_type is null or p_lot.building_type = 'plaza' then return 0; end if;
  cfg := fx_config(p_lot.city_id);
  base := (cfg #>> ('{production,rate_by_level,' || p_lot.level || '}')::text[])::numeric;

  select count(*) into plazas from lots n
   where n.city_id = p_lot.city_id and n.building_type = 'plaza' and n.level > 0 and n.state = 'activo'
     and abs(n.x - p_lot.x) + abs(n.y - p_lot.y) = 1;
  bonus := least(plazas * (cfg #>> '{production,plaza_bonus}')::numeric, (cfg #>> '{production,plaza_bonus_cap}')::numeric);

  if exists (select 1 from public_works w where w.barrio_id = p_lot.barrio_id and w.status = 'completada') then
    work_bonus := 1 + (cfg #>> '{production,public_work_bonus}')::numeric;
  end if;

  st_factor := (cfg #>> ('{production,state_factor,' || p_lot.state || '}')::text[])::numeric;
  return base * (1 + bonus) * work_bonus * st_factor;
end $$;

-- Tasa efectiva: la de §3, y en el residencial, por el atractivo de su barrio (§17.1).
create or replace function fx_effective_rate(p_lot lots) returns numeric
language plpgsql stable set search_path = public as $$
declare rate numeric;
begin
  rate := fx_lot_rate(p_lot);
  if rate > 0 and p_lot.building_type = 'residencial' then
    rate := rate * (fx_barrio_attractiveness(p_lot.barrio_id)->>'attractiveness')::numeric;
  end if;
  return rate;
end $$;

-- ---------------------------------------------------------------------
-- Capacidad (§16.1): 10 por lote con edificio, o la del nivel si es residencial.
-- Durante una mejora cuenta el nivel anterior, que es el que tiene el lote.
-- ---------------------------------------------------------------------
create or replace function fx_barrio_capacity(p_barrio_id uuid) returns int
language plpgsql stable set search_path = public as $$
declare cap int;
begin
  select coalesce(sum(case when l.building_type = 'residencial'
                           then (c.config #>> ('{residential,capacity_by_level,' || l.level || '}')::text[])::int
                           else (c.config #>> '{citizens,capacity_per_lot}')::int end), 0)::int
    into cap
    from lots l join cities c on c.id = l.city_id
   where l.barrio_id = p_barrio_id and l.level > 0;
  return cap;
end $$;

-- ---------------------------------------------------------------------
-- Atractivo (§16.2). Igual que antes, salvo el abastecimiento: se mide con la
-- tasa de §3 y sin el alquiler de los residenciales. Si contara el alquiler, una
-- baja de población bajaría el alquiler, eso el abastecimiento, y se iría más gente.
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
-- Producción perezosa: el residencial entrega su alquiler en lots.rent_material,
-- y el evento y la respuesta llevan el atractivo con que se cobró (§17.2).
-- ---------------------------------------------------------------------
create or replace function fx_collect_production(p_player uuid) returns jsonb
language plpgsql set search_path = public as $$
declare l lots; cfg jsonb; since timestamptz; hours numeric; rate numeric; amount int; mat text; result jsonb;
begin
  select * into l from lots where owner_id = p_player for update;
  if not found or l.level = 0 or l.building_type = 'plaza' then return '{}'::jsonb; end if;
  cfg := fx_config(l.city_id);
  rate := fx_effective_rate(l);

  -- Sin reloj o sin producción (abandonado, o un barrio con atractivo 0): no hay fracción
  -- que guardar y la cuenta arranca de nuevo.
  if l.production_collected_at is null or rate <= 0 then
    update lots set production_collected_at = now() where id = l.id;
    return '{}'::jsonb;
  end if;

  -- Lo acumulado más allá del tope se pierde.
  since := greatest(l.production_collected_at,
                    now() - (cfg #>> '{production,accrual_cap_hours}')::numeric * interval '1 hour');
  hours := extract(epoch from (now() - since)) / 3600.0;
  amount := floor(hours * rate);
  if amount <= 0 then return '{}'::jsonb; end if;

  -- El reloj avanza solo por las unidades entregadas: la fracción sigue acumulando.
  update lots set production_collected_at = since + (amount / rate) * interval '1 hour' where id = l.id;
  if l.building_type = 'residencial' then
    mat := l.rent_material::text;
    result := jsonb_build_object('material', mat, 'amount', amount,
                                 'attractiveness', fx_barrio_attractiveness(l.barrio_id)->'attractiveness');
  else
    mat := cfg #>> ('{buildings,produces,' || l.building_type || '}')::text[];
    result := jsonb_build_object('material', mat, 'amount', amount);
  end if;
  execute format('update inventories set %I = %I + $1 where player_id = $2', mat, mat) using amount, p_player;
  perform fx_log_event(l.city_id, 'production.collected', p_player, l.id, null, result);
  return result;
end $$;

-- ---------------------------------------------------------------------
-- build: suma el material del alquiler (docs/06). Obligatorio en el nivel 1 de un
-- residencial y se guarda en el lote en el acto; en sus mejoras puede venir vacío o
-- igual al que tiene; en cualquier otro tipo tiene que venir vacío.
-- ---------------------------------------------------------------------
drop function build(building_t);

create or replace function build(p_building_type building_t, p_rent_material material_t default null)
returns constructions
language plpgsql security definer set search_path = public as $$
declare me players; l lots; cfg jsonb; target int; cost jsonb; hrs numeric; c constructions; payload jsonb;
begin
  me := fx_me();
  perform fx_collect_production(me.id);
  select * into l from lots where owner_id = me.id for update;
  if not found then raise exception 'NO_LOT'; end if;
  if exists (select 1 from constructions where lot_id = l.id and completed_at is null) then raise exception 'ALREADY_BUILDING'; end if;
  if l.level >= 3 then raise exception 'MAX_LEVEL'; end if;
  if l.level > 0 and l.building_type <> p_building_type then raise exception 'TYPE_LOCKED'; end if;
  if p_building_type = 'residencial' then
    if (l.level = 0 and p_rent_material is null)
       or (l.level > 0 and p_rent_material is not null and p_rent_material <> l.rent_material) then
      raise exception 'RENT_MATERIAL';
    end if;
  elsif p_rent_material is not null then
    raise exception 'RENT_MATERIAL';
  end if;

  cfg := fx_config(me.city_id);
  target := l.level + 1;
  cost := cfg #> ('{buildings,levels,' || target || ',cost}')::text[];
  hrs  := (cfg #>> ('{buildings,levels,' || target || ',hours}')::text[])::numeric;

  perform fx_spend_jornada(me.id);
  perform fx_spend_materials(me.id, (cost->>'ladrillo')::int, (cost->>'madera')::int, (cost->>'energia')::int);

  if p_building_type = 'residencial' and l.level = 0 then
    update lots set rent_material = p_rent_material where id = l.id returning * into l;
  end if;

  insert into constructions(lot_id, building_type, target_level, ends_at)
  values (l.id, p_building_type, target, now() + (hrs * interval '1 hour')) returning * into c;

  payload := jsonb_build_object('building_type', p_building_type, 'target_level', target, 'ends_at', c.ends_at);
  if p_building_type = 'residencial' then
    payload := payload || jsonb_build_object('rent_material', l.rent_material);
  end if;
  perform fx_log_event(me.city_id, 'construction.started', me.id, l.id, null, payload);
  return c;
end $$;

-- Internas: nadie de afuera las ejecuta.
revoke all on function fx_lot_rate(lots) from public, anon, authenticated;
grant execute on function build(building_t, material_t) to authenticated;
