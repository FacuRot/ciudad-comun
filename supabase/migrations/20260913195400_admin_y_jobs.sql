-- =====================================================================
--  Funciones de administración y jobs de cron (todos idempotentes).
-- =====================================================================

-- Interna: abre un barrio cerrado. La usan el admin y job_check_barrio_opening.
create or replace function admin_open_barrio(p_barrio_id uuid, p_reason text default 'admin') returns void
language plpgsql security definer set search_path = public as $$
declare b barrios;
begin
  select * into b from barrios where id = p_barrio_id and status = 'cerrado' for update;
  if not found then return; end if;
  update barrios set status = 'abierto', opened_at = now() where id = b.id;
  update lots set status = 'libre' where barrio_id = b.id and status = 'cerrado';
  perform fx_log_event(b.city_id, 'barrio.opened', null, null, null, jsonb_build_object('barrio_id', b.id, 'name', b.name, 'reason', p_reason));
  insert into notifications_outbox(player_id, type, payload)
  select id, 'barrio.opened', jsonb_build_object('name', b.name) from players where city_id = b.city_id;
end $$;

create or replace function admin_force_open_barrio(p_barrio_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin perform fx_require_admin(); perform admin_open_barrio(p_barrio_id, 'admin'); end $$;

create or replace function admin_city_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := fx_require_admin();
  return (select jsonb_build_object(
    'players', (select count(*) from players where city_id = me.city_id),
    'active_today', (select count(*) from players where city_id = me.city_id and last_seen_at > now() - interval '1 day'),
    'lots_free', (select count(*) from lots where city_id = me.city_id and status = 'libre'),
    'lots_by_state', (select jsonb_object_agg(state, n) from (select state, count(*) n from lots where city_id = me.city_id and status = 'ocupado' group by state) s),
    'constructions_active', (select count(*) from constructions c join lots l on l.id = c.lot_id where l.city_id = me.city_id and c.completed_at is null),
    'works', (select jsonb_agg(jsonb_build_object('name', name, 'status', status, 'progress', progress, 'cost', cost)) from public_works where city_id = me.city_id),
    'pending_notifications', (select count(*) from notifications_outbox where sent_at is null),
    'new_players_24h', (select jsonb_agg(display_name) from players where city_id = me.city_id and created_at > now() - interval '1 day')
  ));
end $$;

-- ---------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------

-- Recarga diaria. Idempotente: una sola recarga por ciudad por día del juego,
-- registrada como evento jornadas.refilled con el día en el payload.
create or replace function job_refill_jornadas() returns void
language plpgsql security definer set search_path = public as $$
declare c cities; today date;
begin
  perform pg_advisory_xact_lock(hashtext('job_refill_jornadas'));
  for c in select * from cities loop
    today := fx_now_local(c.id)::date;
    continue when exists (select 1 from events
                           where city_id = c.id and type = 'jornadas.refilled' and payload->>'day' = today::text);
    update players set jornadas = least(jornadas + (c.config #>> '{jornadas,per_day}')::int, (c.config #>> '{jornadas,cap}')::int)
     where city_id = c.id;
    perform fx_log_event(c.id, 'jornadas.refilled', null, null, null, jsonb_build_object('day', today));
  end loop;
end $$;

create or replace function job_update_lot_states() returns void
language plpgsql security definer set search_path = public as $$
declare r lots; ns lot_state_t;
begin
  for r in select * from lots where status = 'ocupado' for update loop
    ns := fx_lot_state(r);
    if ns <> r.state then
      update lots set state = ns where id = r.id;
      perform fx_log_event(r.city_id, 'lot.state_changed', null, r.id, r.owner_id, jsonb_build_object('from', r.state, 'to', ns));
      if ns = 'descuidado' then perform fx_notify(r.owner_id, 'lot.neglected', '{}'); end if;
    end if;
  end loop;
end $$;

create or replace function job_complete_constructions() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select c.*, l.city_id, l.owner_id from constructions c join lots l on l.id = c.lot_id
            where c.completed_at is null and c.ends_at <= now() for update of c loop
    -- Recoger producción al nivel viejo antes de subir.
    perform fx_collect_production(r.owner_id);
    update lots set building_type = r.building_type, level = r.target_level, production_collected_at = now() where id = r.lot_id;
    update constructions set completed_at = now() where id = r.id;
    perform fx_log_event(r.city_id, 'construction.completed', null, r.lot_id, r.owner_id, jsonb_build_object('building_type', r.building_type, 'level', r.target_level));
    perform fx_notify(r.owner_id, 'construction.completed', jsonb_build_object('building_type', r.building_type, 'level', r.target_level));
  end loop;
end $$;

create or replace function job_check_barrio_opening() returns void
language plpgsql security definer set search_path = public as $$
declare c cities; b barrios; total int; taken int; ratio numeric;
begin
  for c in select * from cities loop
    select * into b from barrios where city_id = c.id and status = 'cerrado' order by ordinal limit 1;
    if not found then continue; end if;
    select count(*), count(*) filter (where status = 'ocupado') into total, taken
      from lots where city_id = c.id and barrio_id in (select id from barrios where city_id = c.id and status = 'abierto');
    ratio := case when total = 0 then 0 else taken::numeric / total end;
    if ratio >= (c.config #>> '{barrio,open_threshold}')::numeric then
      perform admin_open_barrio(b.id, 'threshold');
    elsif now() >= c.opened_at + make_interval(days => (c.config #>> '{barrio,open_after_days}')::int) then
      perform admin_open_barrio(b.id, 'time');
    end if;
  end loop;
end $$;

-- Cron (UTC). 00:00 y 00:10 hora Argentina = 03:00 y 03:10 UTC.
select cron.schedule('refill_jornadas',        '0 3 * * *',   $$select public.job_refill_jornadas()$$);
select cron.schedule('update_lot_states',      '10 3 * * *',  $$select public.job_update_lot_states()$$);
select cron.schedule('complete_constructions', '*/5 * * * *', $$select public.job_complete_constructions()$$);
select cron.schedule('check_barrio_opening',   '0 * * * *',   $$select public.job_check_barrio_opening()$$);
