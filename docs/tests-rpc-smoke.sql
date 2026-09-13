-- Prueba de humo de las funciones RPC y los jobs.
-- Requiere una base con schema.sql cargado. En local (supabase start):
--   psql "$DATABASE_URL" -f tests-rpc-smoke.sql
-- En un Postgres sin Supabase, crear antes: schema auth con auth.users y auth.uid()
-- (que lea request.jwt.claim.sub), un stub de cron.schedule y la publicación supabase_realtime.
-- Verifica: claim con vecindad, construir, ayudar (y bloqueo de ayuda doble), aportar, regalar
-- (y mínimo), cierre de construcción, producción perezosa, decaimiento, cuidar, vuelta del dueño,
-- resumen, recarga de jornadas y apertura del Barrio 2 por tiempo.
\set ON_ERROR_STOP on
-- dos usuarios
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
select set_config('request.jwt.claim.sub', :'A', false);
-- A toma un lote con la 1ra invitación
select (claim_lot((select token from invitations where used_by is null limit 1), 'Facu', (select id from lots where x=0 and y=0), 'La Esquina', 'teal')).id is not null as a_claimed;
-- B intenta un lote aislado (11,7 está cerrado; probamos 5,7 lejos de 0,0)
select set_config('request.jwt.claim.sub', :'B', false);
do $$ begin
  perform claim_lot((select token from invitations where used_by is null limit 1), 'Marta', (select id from lots where x=5 and y=7), 'Lejos', 'rosa');
  raise exception 'DEBIO FALLAR';
exception when others then
  if sqlerrm <> 'LOT_ISOLATED' then raise; end if;
  raise notice 'ok LOT_ISOLATED';
end $$;
-- B toma uno adyacente
select (claim_lot((select token from invitations where used_by is null limit 1), 'Marta', (select id from lots where x=1 and y=0), 'Al Lado', 'rosa')).id is not null as b_claimed;
-- A construye generador
select set_config('request.jwt.claim.sub', :'A', false);
select (build('generador')).target_level as a_build_lvl;
select jornadas, (select energia from inventories where player_id=:'A') from players where id=:'A';
-- B ayuda la construcción de A
select set_config('request.jwt.claim.sub', :'B', false);
select ends_at - started_at as duration_after_help from help_construction((select id from constructions where completed_at is null limit 1));
-- B ayuda de nuevo -> debe fallar por PK
do $$ begin
  perform help_construction((select id from constructions where completed_at is null limit 1));
  raise exception 'DEBIO FALLAR';
exception when unique_violation then raise notice 'ok ayuda duplicada bloqueada';
end $$;
-- B aporta a la Escuela con 5 madera
select (contribute((select id from public_works where name='Escuela'), 0, 5, 0)).progress as escuela_progress;
-- B regala 10 ladrillo a A
select gift(:'A', 'ladrillo', 10);
select ladrillo from inventories where player_id=:'A';
-- B regala demasiado poco -> falla
do $$ begin perform gift('11111111-1111-1111-1111-111111111111','madera',2); raise exception 'DEBIO FALLAR';
exception when others then if sqlerrm<>'GIFT_TOO_SMALL' then raise; end if; raise notice 'ok GIFT_TOO_SMALL'; end $$;
-- completar construcción forzando ends_at
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select building_type, level from lots where owner_id=:'A';
-- producción perezosa: simular 10h
update lots set production_collected_at = now() - interval '10 hours' where owner_id=:'A';
select set_config('request.jwt.claim.sub', :'A', false);
select (heartbeat())->'collected' as collected_10h;
-- decaimiento: A ausente 5 días
update players set last_seen_at = now() - interval '5 days' where id=:'A';
select job_update_lot_states();
select state from lots where owner_id=:'A';
-- B cuida
select set_config('request.jwt.claim.sub', :'B', false);
select (care_lot((select id from lots where owner_id=:'A'))).state as state_after_care;
-- A vuelve
select set_config('request.jwt.claim.sub', :'A', false);
select (heartbeat())->>'show_summary' as show_summary;
select state, care_days from lots where owner_id=:'A';
select count(*) as summary_events from get_summary(now() - interval '1 day');
-- recarga de jornadas y apertura de barrio por tiempo
select jornadas from players where id=:'A';
select job_refill_jornadas();
select jornadas from players where id=:'A';
update cities set opened_at = now() - interval '11 days';
select job_check_barrio_opening();
select status from barrios where ordinal=2;
select count(*) filter (where status='libre') as libres_b2 from lots where barrio_id=(select id from barrios where ordinal=2);
select type, count(*) from events group by 1 order by 1;
select type, count(*) from notifications_outbox group by 1 order by 1;
