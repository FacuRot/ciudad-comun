-- =====================================================================
--  Funciones internas (no expuestas al cliente). Las usan las RPC y los jobs.
-- =====================================================================

-- Config de una ciudad.
create or replace function fx_config(p_city uuid) returns jsonb
language sql stable set search_path = public as
$$ select config from cities where id = p_city $$;

-- Hora actual en la zona horaria de la ciudad.
create or replace function fx_now_local(p_city uuid) returns timestamp
language sql stable set search_path = public as
$$ select (now() at time zone (select timezone from cities where id = p_city)) $$;

create or replace function fx_log_event(
  p_city uuid, p_type text, p_actor uuid, p_lot uuid, p_target uuid, p_payload jsonb default '{}'
) returns void language sql set search_path = public as $$
  insert into events(city_id, type, actor_id, lot_id, target_player_id, payload)
  values (p_city, p_type, p_actor, p_lot, p_target, coalesce(p_payload,'{}'));
$$;

create or replace function fx_notify(p_player uuid, p_type text, p_payload jsonb default '{}')
returns void language sql set search_path = public as $$
  insert into notifications_outbox(player_id, type, payload) values (p_player, p_type, coalesce(p_payload,'{}'));
$$;

-- Jugador actual, con bloqueo de fila. Falla si no existe.
create or replace function fx_me() returns players
language plpgsql set search_path = public as $$
declare me players;
begin
  select * into me from players where id = auth.uid() for update;
  if not found then raise exception 'NO_PLAYER'; end if;
  return me;
end $$;

-- Jugador actual que además es admin. Falla si no lo es.
create or replace function fx_require_admin() returns players
language plpgsql set search_path = public as $$
declare me players;
begin
  me := fx_me();
  if not me.is_admin then raise exception 'NOT_ADMIN'; end if;
  return me;
end $$;

-- Consume una jornada o falla.
create or replace function fx_spend_jornada(p_player uuid) returns void
language plpgsql set search_path = public as $$
begin
  update players set jornadas = jornadas - 1 where id = p_player and jornadas > 0;
  if not found then raise exception 'NO_JORNADAS'; end if;
end $$;

-- Descuenta materiales o falla.
create or replace function fx_spend_materials(p_player uuid, p_l int, p_m int, p_e int) returns void
language plpgsql set search_path = public as $$
begin
  update inventories
     set ladrillo = ladrillo - p_l, madera = madera - p_m, energia = energia - p_e
   where player_id = p_player and ladrillo >= p_l and madera >= p_m and energia >= p_e;
  if not found then raise exception 'NO_MATERIALS'; end if;
end $$;

-- Estado del lote según días efectivos sin entrar del dueño.
create or replace function fx_lot_state(p_lot lots) returns lot_state_t
language plpgsql stable set search_path = public as $$
declare cfg jsonb; days_away numeric; eff numeric; seen timestamptz;
begin
  if p_lot.owner_id is null then return 'activo'; end if;
  cfg := fx_config(p_lot.city_id);
  select last_seen_at into seen from players where id = p_lot.owner_id;
  days_away := extract(epoch from (now() - seen)) / 86400.0;
  eff := days_away - p_lot.care_days;
  if eff >= (cfg #>> '{decay,abandonado_after_days}')::numeric then return 'abandonado';
  elsif eff >= (cfg #>> '{decay,descuidado_after_days}')::numeric then return 'descuidado';
  else return 'activo'; end if;
end $$;

-- Tasa efectiva de producción (unidades/hora) de un lote.
create or replace function fx_effective_rate(p_lot lots) returns numeric
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

-- Recoge la producción pendiente del lote del jugador (perezosa, con tope).
create or replace function fx_collect_production(p_player uuid) returns jsonb
language plpgsql set search_path = public as $$
declare l lots; cfg jsonb; hours numeric; rate numeric; amount int; mat text;
begin
  select * into l from lots where owner_id = p_player for update;
  if not found or l.level = 0 or l.building_type = 'plaza' then return '{}'::jsonb; end if;
  cfg := fx_config(l.city_id);
  hours := least(extract(epoch from (now() - coalesce(l.production_collected_at, now()))) / 3600.0,
                 (cfg #>> '{production,accrual_cap_hours}')::numeric);
  rate := fx_effective_rate(l);
  amount := floor(hours * rate);
  update lots set production_collected_at = now() where id = l.id;
  if amount <= 0 then return '{}'::jsonb; end if;
  mat := cfg #>> ('{buildings,produces,' || l.building_type || '}')::text[];
  execute format('update inventories set %I = %I + $1 where player_id = $2', mat, mat) using amount, p_player;
  perform fx_log_event(l.city_id, 'production.collected', p_player, l.id, null, jsonb_build_object('material', mat, 'amount', amount));
  return jsonb_build_object('material', mat, 'amount', amount);
end $$;
