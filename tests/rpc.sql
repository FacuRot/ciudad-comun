-- =====================================================================
--  Pruebas de las funciones RPC y los jobs: caso feliz + cada código de error.
--  Requiere una base recién sembrada: asume el seed sin jugadores.
--  Corre dentro de una transacción y hace rollback al final, así que se puede repetir.
--
--    npx supabase db query --linked -f tests/rpc.sql          (proyecto en la nube)
--    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rpc.sql  (con psql)
--
--  Sin comandos de psql, para que también corra por la Management API.
--  Cada verificación emite "ok ..." como NOTICE; la primera falla corta con "FALLÓ: ...".
--  Si termina sin error, pasaron todas.
--  Dentro de la transacción now() es constante: los tiempos se simulan moviendo columnas.
--  OTHER_CITY no se prueba: no es alcanzable con una sola ciudad.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;

-- Ejecuta p_sql y exige que falle con el código dado (mensaje de raise o SQLSTATE).
create function pg_temp.err(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code or sqlstate = p_code then
      raise notice 'ok  % ← %', p_code, p_sql;
      return;
    end if;
    raise exception 'FALLÓ: esperaba % y vino % [%] en: %', p_code, sqlerrm, sqlstate, p_sql;
  end;
  raise exception 'FALLÓ: esperaba % y no falló: %', p_code, p_sql;
end $$;

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true); end $$;

create function pg_temp.tok() returns text language sql as $$
  select token from invitations where used_by is null and inviter_id is null order by created_at, token limit 1 $$;

create function pg_temp.lot(p_x int, p_y int) returns uuid language sql as $$
  select id from lots where x = p_x and y = p_y $$;

create function pg_temp.work(p_name text) returns uuid language sql as $$
  select id from public_works where name = p_name $$;

-- A, B y C van a tener lote. D es un usuario autenticado sin jugador.
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'c@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'd@test.local');

-- ---------------------------------------------------------------------
-- claim_lot
-- ---------------------------------------------------------------------
select pg_temp.as_user(null);
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Facu', pg_temp.lot(0,0), 'La Esquina', 'teal')$$, 'NO_AUTH');

select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.err($$select claim_lot('no-existe', 'Facu', pg_temp.lot(0,0), 'La Esquina', 'teal')$$, 'BAD_INVITE');
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Facu', pg_temp.lot(7,0), 'La Esquina', 'teal')$$, 'LOT_NOT_FREE');
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Facu', pg_temp.lot(0,0), 'La Esquina', 'verde')$$, 'BAD_COLOR');
select pg_temp.ok((claim_lot(pg_temp.tok(), 'Facu', pg_temp.lot(0,0), 'La Esquina', 'teal')).status = 'ocupado',
                  'claim_lot: A funda en (0,0) con la ciudad vacía');
select pg_temp.ok((select jornadas = 3 from players where id = '11111111-1111-1111-1111-111111111111'), 'jornadas iniciales = 3');
select pg_temp.ok((select (ladrillo, madera, energia) = (20, 20, 10) from inventories where player_id = '11111111-1111-1111-1111-111111111111'),
                  'kit inicial 20/20/10');
select pg_temp.ok((select count(*) = 1 from invitations where used_by = '11111111-1111-1111-1111-111111111111'), 'la invitación queda usada');
select pg_temp.ok((select count(*) = 2 from events where actor_id = '11111111-1111-1111-1111-111111111111'
                     and type in ('player.joined','lot.claimed')), 'eventos player.joined y lot.claimed');
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Facu2', pg_temp.lot(1,0), 'Otro', 'teal')$$, 'ALREADY_PLAYER');

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Marta', pg_temp.lot(5,7), 'Lejos', 'rosa')$$, 'LOT_ISOLATED');
select pg_temp.err($$select claim_lot(pg_temp.tok(), 'Marta', pg_temp.lot(0,0), 'Encima', 'rosa')$$, 'LOT_NOT_FREE');
select pg_temp.ok((claim_lot(pg_temp.tok(), 'Marta', pg_temp.lot(1,0), 'Al Lado', 'rosa')).owner_id = '22222222-2222-2222-2222-222222222222',
                  'claim_lot: B funda al lado de A');
select pg_temp.ok((select count(*) = 1 from notifications_outbox where player_id = '11111111-1111-1111-1111-111111111111' and type = 'neighbor.new'),
                  'aviso neighbor.new para A');

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.ok((claim_lot(pg_temp.tok(), 'Julián', pg_temp.lot(0,1), 'La Casita', 'ocre')).owner_id = '33333333-3333-3333-3333-333333333333',
                  'claim_lot: C funda en (0,1)');

-- ---------------------------------------------------------------------
-- rename_lot / recolor_lot
-- ---------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select rename_lot('Nueva Esquina');
select pg_temp.ok((select name = 'Nueva Esquina' from lots where x = 0 and y = 0), 'rename_lot');
select pg_temp.err($$select rename_lot('Al Lado')$$, '23505');  -- nombre repetido en la ciudad
select pg_temp.err($$select recolor_lot('verde')$$, 'BAD_COLOR');
select recolor_lot('ocre');
select pg_temp.ok((select color = 'ocre' from lots where x = 0 and y = 0), 'recolor_lot');
select pg_temp.ok((select count(*) = 2 from events where type in ('lot.renamed','lot.recolored')), 'eventos lot.renamed y lot.recolored');

-- ---------------------------------------------------------------------
-- build
-- ---------------------------------------------------------------------
select build('generador');
select pg_temp.ok((select jornadas = 2 from players where id = '11111111-1111-1111-1111-111111111111'), 'build gasta 1 jornada');
select pg_temp.ok((select (ladrillo, madera, energia) = (5, 10, 10) from inventories where player_id = '11111111-1111-1111-1111-111111111111'),
                  'build gasta el costo del nivel 1');
select pg_temp.ok((select ends_at - started_at = interval '4 hours' from constructions where completed_at is null), 'el nivel 1 tarda 4 h');
select pg_temp.err($$select build('generador')$$, 'ALREADY_BUILDING');

-- ---------------------------------------------------------------------
-- help_construction
-- ---------------------------------------------------------------------
select pg_temp.err($$select help_construction((select id from constructions where completed_at is null))$$, 'OWN_CONSTRUCTION');

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.err($$select help_construction(gen_random_uuid())$$, 'NO_CONSTRUCTION');
select pg_temp.ok((help_construction((select id from constructions where completed_at is null))).ends_at - now() = interval '2 hours',
                  'help_construction resta 2 h');
select pg_temp.err($$select help_construction((select id from constructions where completed_at is null))$$, '23505');  -- ya ayudó
select pg_temp.ok((select jornadas = 2 from players where id = '22222222-2222-2222-2222-222222222222'),
                  'ayudar gasta 1 jornada (la ayuda repetida no)');
select pg_temp.ok((select count(*) = 1 from notifications_outbox where player_id = '11111111-1111-1111-1111-111111111111' and type = 'construction.helped'),
                  'aviso de ayuda al dueño');

-- ---------------------------------------------------------------------
-- contribute
-- ---------------------------------------------------------------------
select pg_temp.ok((contribute(pg_temp.work('Escuela'), 0, 5, 0)).progress = '{"ladrillo":0,"madera":5,"energia":0,"jornadas":1}'::jsonb,
                  'contribute suma materiales y 1 jornada de obra');
select pg_temp.err($$select contribute(pg_temp.work('Escuela'), -1, 0, 0)$$, 'BAD_AMOUNT');
select pg_temp.err($$select contribute(pg_temp.work('Escuela'), 0, 0, 100)$$, 'NO_MATERIALS');
select pg_temp.err($$select contribute(gen_random_uuid(), 0, 0, 0)$$, 'NO_WORK');

-- ---------------------------------------------------------------------
-- gift
-- ---------------------------------------------------------------------
select gift('11111111-1111-1111-1111-111111111111', 'ladrillo', 10);
select pg_temp.ok((select ladrillo = 15 from inventories where player_id = '11111111-1111-1111-1111-111111111111')
              and (select ladrillo = 10 from inventories where player_id = '22222222-2222-2222-2222-222222222222'), 'gift mueve materiales');
select pg_temp.err($$select gift('11111111-1111-1111-1111-111111111111', 'madera', 2)$$, 'GIFT_TOO_SMALL');
select pg_temp.err($$select gift('22222222-2222-2222-2222-222222222222', 'madera', 10)$$, 'SELF_GIFT');
select pg_temp.err($$select gift('11111111-1111-1111-1111-111111111111', 'madera', 500)$$, 'NO_MATERIALS');
select pg_temp.err($$select gift('44444444-4444-4444-4444-444444444444', 'madera', 5)$$, 'NO_PLAYER');
select pg_temp.ok((select madera = 10 from inventories where player_id = '11111111-1111-1111-1111-111111111111'),
                  'un regalo fallido no crea materiales');

-- ---------------------------------------------------------------------
-- NO_JORNADAS
-- ---------------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
update players set jornadas = 0 where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.err($$select contribute(pg_temp.work('Hospital'), 0, 0, 0)$$, 'NO_JORNADAS');
update players set jornadas = 3 where id = '33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------
-- job_complete_constructions (dos veces: idempotente)
-- ---------------------------------------------------------------------
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select job_complete_constructions();
select pg_temp.ok((select (building_type, level) = ('generador'::building_t, 1) from lots where x = 0 and y = 0),
                  'job_complete_constructions sube el nivel');
select pg_temp.ok((select count(*) = 1 from events where type = 'construction.completed'), 'job_complete_constructions es idempotente');

-- build: errores con edificio existente
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.err($$select build('ladrilleria')$$, 'TYPE_LOCKED');
select pg_temp.err($$select build('generador')$$, 'NO_MATERIALS');
update lots set level = 3 where x = 0 and y = 0;
select pg_temp.err($$select build('generador')$$, 'MAX_LEVEL');
update lots set level = 1 where x = 0 and y = 0;

-- ---------------------------------------------------------------------
-- Producción perezosa (heartbeat)
-- ---------------------------------------------------------------------
update lots set production_collected_at = now() - interval '10 hours' where x = 0 and y = 0;
select pg_temp.ok((heartbeat())->'collected' = '{"material":"energia","amount":20}'::jsonb, 'producción perezosa: 10 h × 2/h');
select pg_temp.ok((select energia = 30 from inventories where player_id = '11111111-1111-1111-1111-111111111111'), 'lo producido entra al inventario');
update lots set production_collected_at = now() - interval '100 hours' where x = 0 and y = 0;
select pg_temp.ok((heartbeat())->'collected'->>'amount' = '96', 'tope de 48 h de acumulación');

-- ---------------------------------------------------------------------
-- visit_lot
-- ---------------------------------------------------------------------
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select visit_lot(pg_temp.lot(0,0));
select visit_lot(pg_temp.lot(0,0));
select visit_lot(pg_temp.lot(0,1));  -- el propio no cuenta
select pg_temp.ok((select count(*) = 1 from events where type = 'lot.visited'), 'visit_lot: una por día y la propia no cuenta');

-- ---------------------------------------------------------------------
-- Decaimiento (dos veces: idempotente) y care_lot
-- ---------------------------------------------------------------------
update players set last_seen_at = now() - interval '5 days' where id = '11111111-1111-1111-1111-111111111111';
select job_update_lot_states();
select job_update_lot_states();
select pg_temp.ok((select state = 'descuidado' from lots where x = 0 and y = 0), '5 días sin entrar: descuidado');
select pg_temp.ok((select count(*) = 1 from events where type = 'lot.state_changed'), 'job_update_lot_states es idempotente');
select pg_temp.ok((select count(*) = 1 from notifications_outbox where type = 'lot.neglected'), 'aviso lot.neglected');
select pg_temp.ok((select fx_effective_rate(l) = 1 from lots l where x = 0 and y = 0), 'descuidado produce al 50 %');

select pg_temp.err($$select care_lot(pg_temp.lot(0,1))$$, 'OWN_LOT');
select pg_temp.err($$select care_lot(pg_temp.lot(2,0))$$, 'NO_LOT');  -- lote libre

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.err($$select care_lot(pg_temp.lot(0,1))$$, 'LOT_NOT_NEGLECTED');
update players set jornadas = 6 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok((care_lot(pg_temp.lot(0,0))).state = 'activo', 'care_lot: +2 días devuelve el lote a activo');
select pg_temp.ok((select (care_days, care_count) = (2, 1) from lots where x = 0 and y = 0), 'care_lot suma días y cuenta');
update lots set state = 'descuidado', care_count = 3 where x = 0 and y = 0;
select pg_temp.err($$select care_lot(pg_temp.lot(0,0))$$, 'CARE_LIMIT');

-- ---------------------------------------------------------------------
-- Vuelta del dueño y resumen
-- ---------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.ok((heartbeat())->>'show_summary' = 'true', 'heartbeat tras 5 días pide resumen');
select pg_temp.ok((select (state, care_days, care_count) = ('activo'::lot_state_t, 0, 0) from lots where x = 0 and y = 0),
                  'al volver, el lote se reactiva y se reinician los cuidados');
select pg_temp.ok((select count(*) = 1 from events where type = 'session.started'), 'session.started registrado');
select pg_temp.ok((select array_agg(distinct type) from get_summary(now() - interval '1 day'))
                  @> array['construction.completed','construction.helped','gift.sent','lot.cared','lot.visited',
                           'player.joined','public_work.contributed'],
                  'get_summary trae lo que pasó en la ausencia');

-- ---------------------------------------------------------------------
-- Recarga de jornadas (dos veces: idempotente)
-- ---------------------------------------------------------------------
delete from events where type = 'jornadas.refilled';
select job_refill_jornadas();
select job_refill_jornadas();
select pg_temp.ok((select jornadas = 5 from players where id = '11111111-1111-1111-1111-111111111111'), 'recarga: 2 + 3 = 5, una vez por día');
select pg_temp.ok((select jornadas = 6 from players where id = '22222222-2222-2222-2222-222222222222'), 'recarga respeta el tope de 6');

-- ---------------------------------------------------------------------
-- Apertura del Barrio 2 (dos veces: idempotente)
-- ---------------------------------------------------------------------
select job_check_barrio_opening();
select pg_temp.ok((select status = 'cerrado' from barrios where ordinal = 2), 'Barrio 2 sigue cerrado (3/41 ocupados, día 0)');
update cities set opened_at = now() - interval '11 days';
select job_check_barrio_opening();
select job_check_barrio_opening();
select pg_temp.ok((select count(*) = 34 from lots l join barrios b on b.id = l.barrio_id where b.ordinal = 2 and l.status = 'libre'),
                  'apertura por tiempo: 34 lotes libres');
select pg_temp.ok((select count(*) = 1 from events where type = 'barrio.opened'), 'job_check_barrio_opening es idempotente');

-- ---------------------------------------------------------------------
-- Obra completa y bonus
-- ---------------------------------------------------------------------
update public_works set progress = '{"ladrillo":499,"madera":400,"energia":300,"jornadas":89}' where name = 'Escuela';
select pg_temp.ok((contribute(pg_temp.work('Escuela'), 50, 0, 0)).status = 'completada', 'contribute completa la Escuela');
select pg_temp.ok((select ladrillo = 14 from inventories where player_id = '11111111-1111-1111-1111-111111111111'),
                  'el aporte se recorta a lo que falta');
select pg_temp.ok((select count(*) = 3 from notifications_outbox where type = 'public_work.completed'), 'aviso de obra completada a toda la ciudad');
select pg_temp.ok((select count(*) = 1 from events where type = 'public_work.completed'), 'evento public_work.completed');
select pg_temp.ok((select fx_effective_rate(l) = 2.3 from lots l where x = 0 and y = 0), 'bonus de obra del barrio: 2 × 1.15');
select pg_temp.err($$select contribute(pg_temp.work('Escuela'), 0, 0, 0)$$, 'NO_WORK');

-- Plaza vecina: C construye una plaza en (0,1), pegada a A.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select build('plaza');
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select pg_temp.ok((select fx_effective_rate(l) = 2.53 from lots l where x = 0 and y = 0), 'plaza adyacente: 2 × 1.10 × 1.15');

-- ---------------------------------------------------------------------
-- Admin, invitaciones y NO_PLAYER
-- ---------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.err($$select admin_city_stats()$$, 'NOT_ADMIN');
select pg_temp.err($$select admin_force_open_barrio(gen_random_uuid())$$, 'NOT_ADMIN');
update players set is_admin = true where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok((admin_city_stats())->>'players' = '3', 'admin_city_stats');
-- En sentencias separadas: invitation_info es STABLE y no ve lo insertado en la misma sentencia.
select set_config('test.token', create_invitation(), true);
select pg_temp.ok((invitation_info(current_setting('test.token')))->>'inviter' = 'Facu', 'create_invitation + invitation_info');
select pg_temp.ok(invitation_info('no-existe') is null, 'invitation_info de un token inexistente');

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select pg_temp.err($$select heartbeat()$$, 'NO_PLAYER');

rollback;
select 'Todas las pruebas pasaron.' as resultado, (select count(*) from players) as jugadores_tras_rollback;
