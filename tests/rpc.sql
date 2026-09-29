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

create function pg_temp.barrio(p_ordinal int) returns uuid language sql as $$
  select id from barrios where ordinal = p_ordinal $$;

-- El único evento de población que hay (las pruebas borran los anteriores antes de correr el job).
create function pg_temp.population_event() returns jsonb language sql as $$
  select payload from events where type = 'barrio.population_changed' $$;

-- Las calles se gastan desde el seed: se las deja recién mantenidas para que los atractivos
-- de las pruebas no dependan de cuánto hace que se sembró la base.
update barrios set streets_updated_at = now() where status = 'abierto';

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
select pg_temp.ok((select ends_at - started_at = (config #>> '{buildings,levels,1,hours}')::numeric * interval '1 hour'
                     from constructions, cities where completed_at is null), 'el nivel 1 tarda lo que dice la config');
select pg_temp.err($$select build('generador')$$, 'ALREADY_BUILDING');

-- ---------------------------------------------------------------------
-- help_construction
-- ---------------------------------------------------------------------
select pg_temp.err($$select help_construction((select id from constructions where completed_at is null))$$, 'OWN_CONSTRUCTION');

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.err($$select help_construction(gen_random_uuid())$$, 'NO_CONSTRUCTION');
select pg_temp.ok((help_construction((select id from constructions where completed_at is null))).ends_at - now()
                  = (select ((config #>> '{buildings,levels,1,hours}')::numeric - (config #>> '{help,hours_reduced}')::numeric)
                            * interval '1 hour' from cities),
                  'help_construction resta help.hours_reduced');
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
update lots set production_collected_at = now() - interval '45 minutes' where x = 0 and y = 0;
select pg_temp.ok((heartbeat())->'collected'->>'amount' = '1', 'entrega unidades enteras: 45 min × 2/h = 1');
select pg_temp.ok((select abs(extract(epoch from production_collected_at - (now() - interval '15 minutes'))) < 1
                     from lots where x = 0 and y = 0), 'la fracción sigue acumulando: el reloj avanza solo 30 min');
select pg_temp.ok((heartbeat())->'collected' = '{}'::jsonb
                  and (select abs(extract(epoch from production_collected_at - (now() - interval '15 minutes'))) < 1
                         from lots where x = 0 and y = 0), 'recoger cero no reinicia la cuenta');

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
-- Ciudadanos (dos veces: idempotente)
-- ---------------------------------------------------------------------
-- En el Barrio 1 hay un solo edificio (el generador de A), los tres lotes están activos
-- y la Escuela sigue en curso: atractivo 0,9 y el motivo es la obra.
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 10, 'capacidad: 10 por lote con edificio');
select pg_temp.ok(((fx_barrio_attractiveness(pg_temp.barrio(1)))->>'attractiveness')::numeric = 0.9
                  and (fx_barrio_attractiveness(pg_temp.barrio(1)))->>'main_reason' = 'obra',
                  'atractivo sin la obra terminada: 0,9, y lo que más resta es la obra');
select pg_temp.ok(((fx_barrio_attractiveness(pg_temp.barrio(1)))->'factors'->>'abastecimiento')::numeric = 1,
                  'con población 0 el abastecimiento vale 1');

select job_update_population();
select job_update_population();
select pg_temp.ok((select population = 3 from barrios where ordinal = 1), 'llegan ceil(30 % de 9) = 3');
select pg_temp.ok((select count(*) = 1 from events where type = 'barrio.population_changed'),
                  'job_update_population es idempotente y no toca el barrio cerrado');
select pg_temp.ok(pg_temp.population_event() @> '{"from": 0, "to": 3, "target": 9, "capacity": 10, "main_reason": "obra"}',
                  'barrio.population_changed lleva antes, después, objetivo, capacidad y motivo');
select pg_temp.ok(exists (select 1 from get_summary(now() - interval '1 day') where type = 'barrio.population_changed'),
                  'get_summary trae la población del barrio propio');

-- Con A descuidado el atractivo baja a 0,85: objetivo 8, y de 10 se va ceil(15 % de 2) = 1.
-- Con open_population en 9, el mismo job abre el Barrio 2 por población.
delete from events where type = 'barrio.population_changed';
update barrios set population = 10 where ordinal = 1;
update lots set state = 'descuidado' where x = 0 and y = 0;
update cities set config = jsonb_set(config, '{barrio,open_population}', '9');
select job_update_population();
select pg_temp.ok((select population = 9 from barrios where ordinal = 1), 'se van ceil(15 % de 2) = 1');
select pg_temp.ok(pg_temp.population_event() @> '{"target": 8, "factors": {"lotes": 0.8333}}'
                  and (pg_temp.population_event()->>'attractiveness')::numeric = 0.85,
                  'un lote descuidado baja el factor lotes a 0,8333 y el atractivo a 0,85');
select pg_temp.ok((select payload->>'reason' = 'population' from events where type = 'barrio.opened'),
                  'job_update_population abre el Barrio 2 al llegar a open_population');

-- La población nunca pasa la capacidad.
update lots set state = 'activo' where x = 0 and y = 0;
update cities set config = jsonb_set(config, '{barrio,open_population}', '300');
delete from events where type = 'barrio.population_changed';
update barrios set population = 50 where ordinal = 1;
select job_update_population();
select pg_temp.ok((select population = 10 from barrios where ordinal = 1), 'la población se recorta a la capacidad');

-- Vuelve el Barrio 2 a cerrado para probar la apertura por tiempo.
delete from events where type in ('barrio.opened', 'barrio.population_changed');
delete from notifications_outbox where type = 'barrio.opened';
update barrios set status = 'cerrado', opened_at = null, population = 0 where ordinal = 2;
update lots l set status = 'cerrado' from barrios b where b.id = l.barrio_id and b.ordinal = 2;

-- ---------------------------------------------------------------------
-- Apertura del Barrio 2 (dos veces: idempotente)
-- ---------------------------------------------------------------------
select job_check_barrio_opening();
select pg_temp.ok((select status = 'cerrado' from barrios where ordinal = 2), 'Barrio 2 sigue cerrado (3/41 ocupados, día 0, 10 ciudadanos)');
update cities set opened_at = now() - interval '11 days';
select job_check_barrio_opening();
select job_check_barrio_opening();
select pg_temp.ok((select count(*) = 34 from lots l join barrios b on b.id = l.barrio_id where b.ordinal = 2 and l.status = 'libre'),
                  'apertura por tiempo: 34 lotes libres');
select pg_temp.ok((select count(*) = 1 from events where type = 'barrio.opened'), 'job_check_barrio_opening es idempotente');
select pg_temp.ok((select payload->>'reason' = 'time' from events where type = 'barrio.opened'), 'la razón de la apertura es el tiempo');
select pg_temp.ok((select (population, streets_state, streets_updated_at) = (0, 100::numeric, now()) from barrios where ordinal = 2),
                  'al abrirse, el barrio arranca sin población y con las calles en 100 y el reloj en marcha');

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
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 10, 'una primera construcción en curso no aloja a nadie');
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select pg_temp.ok((select fx_effective_rate(l) = 2.53 from lots l where x = 0 and y = 0), 'plaza adyacente: 2 × 1.10 × 1.15');
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 20, 'la plaza también aloja 10');
select pg_temp.ok((fx_barrio_attractiveness(pg_temp.barrio(1)))->>'main_reason' is null
                  and ((fx_barrio_attractiveness(pg_temp.barrio(1)))->>'attractiveness')::numeric = 1,
                  'con la Escuela terminada y todo en orden, atractivo 1 y ningún motivo');

-- ---------------------------------------------------------------------
-- Residencial y alquiler
-- ---------------------------------------------------------------------
-- B, en (1,0) y sin edificio, construye un residencial que cobra en madera.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
update inventories set ladrillo = 100, madera = 100, energia = 100 where player_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.err($$select build('residencial')$$, 'RENT_MATERIAL');
select pg_temp.err($$select build('generador', 'ladrillo')$$, 'RENT_MATERIAL');
select build('residencial', 'madera');
select pg_temp.ok((select rent_material = 'madera' from lots where x = 1 and y = 0),
                  'build guarda el material del alquiler al iniciar el nivel 1');
select pg_temp.ok((select payload @> '{"building_type": "residencial", "rent_material": "madera"}' from events
                    where type = 'construction.started' and actor_id = '22222222-2222-2222-2222-222222222222'),
                  'construction.started lleva el material del alquiler');
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 20, 'un residencial en obra todavía no aloja a nadie');
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 50, 'el residencial nivel 1 aloja 30');

-- Con 50 ciudadanos el barrio consume 100 por día y produce 2,53 × 24 = 60,72 (el alquiler no cuenta):
-- abastecimiento 0,6072 y atractivo 0,3 + 0,3 + 0,3 × 0,6072 + 0,1 = 0,8822.
update barrios set population = 50 where ordinal = 1;
select pg_temp.ok((select fx_lot_rate(l) = 2.3 from lots l where x = 1 and y = 0), 'la tasa de §3 del residencial: 2 × 1.15');
select pg_temp.ok(((fx_barrio_attractiveness(pg_temp.barrio(1)))->'factors'->>'abastecimiento')::numeric = 0.6072
                  and ((fx_barrio_attractiveness(pg_temp.barrio(1)))->>'attractiveness')::numeric = 0.8822,
                  'el alquiler no cuenta para el abastecimiento');
select pg_temp.ok((select fx_effective_rate(l) = 2.3 * 0.8822 from lots l where x = 1 and y = 0),
                  'el alquiler rinde la tasa de §3 por el atractivo');
update lots set production_collected_at = now() - interval '10 hours' where x = 1 and y = 0;
select pg_temp.ok((heartbeat())->'collected' = '{"material": "madera", "amount": 20, "attractiveness": 0.8822}'::jsonb,
                  'el alquiler se cobra en el material elegido: 10 h × 2,03/h, con el atractivo');
select pg_temp.ok((select madera = 110 from inventories where player_id = '22222222-2222-2222-2222-222222222222'),
                  'el alquiler entra al inventario: 100 − 10 del nivel 1 + 20');
select pg_temp.ok((select payload->>'attractiveness' = '0.8822' from events
                    where type = 'production.collected' and actor_id = '22222222-2222-2222-2222-222222222222'),
                  'production.collected del residencial lleva el atractivo');

-- Mejoras: el material puede venir vacío o igual; distinto, no.
select pg_temp.err($$select build('residencial', 'ladrillo')$$, 'RENT_MATERIAL');
select build('residencial');
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 50, 'durante la mejora cuenta el nivel anterior');
update constructions set ends_at = now() - interval '1 minute' where completed_at is null;
select job_complete_constructions();
select pg_temp.ok(fx_barrio_capacity(pg_temp.barrio(1)) = 80
                  and (select rent_material = 'madera' from lots where x = 1 and y = 0),
                  'el residencial nivel 2 aloja 60 y sigue cobrando en madera');

-- ---------------------------------------------------------------------
-- Calles
-- ---------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update players set jornadas = 6 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                                             '33333333-3333-3333-3333-333333333333');
update inventories set ladrillo = 50 where player_id in ('11111111-1111-1111-1111-111111111111',
                                                         '22222222-2222-2222-2222-222222222222');
update inventories set ladrillo = 5 where player_id = '33333333-3333-3333-3333-333333333333';

-- Recién mantenidas no hay nada que hacer; tampoco si lo que se ve redondeado ya es 100.
select pg_temp.err($$select maintain_streets(pg_temp.barrio(1))$$, 'STREETS_FULL');
update barrios set streets_state = 99.6 where ordinal = 1;
select pg_temp.err($$select maintain_streets(pg_temp.barrio(1))$$, 'STREETS_FULL');
select pg_temp.err($$select maintain_streets(gen_random_uuid())$$, 'OTHER_CITY');
update barrios set status = 'cerrado' where ordinal = 2;
update barrios set streets_state = 50 where ordinal = 2;
select pg_temp.err($$select maintain_streets(pg_temp.barrio(2))$$, 'STREETS_FULL');
update barrios set status = 'abierto', streets_state = 100 where ordinal = 2;

-- Desgaste perezoso: 3 días a 10 por día son 30 puntos, y nunca baja de 0.
update barrios set streets_state = 100, streets_updated_at = now() - interval '3 days' where ordinal = 1;
select pg_temp.ok(fx_streets_state(pg_temp.barrio(1)) = 70, 'las calles se gastan 10 por día');
select pg_temp.ok(((fx_barrio_attractiveness(pg_temp.barrio(1)))->'factors'->>'calles')::numeric = 0.7,
                  'el factor calles del atractivo es el estado ÷ 100');
update barrios set streets_updated_at = now() - interval '20 days' where ordinal = 2;
select pg_temp.ok(fx_streets_state(pg_temp.barrio(2)) = 0, 'las calles no bajan de 0');

-- A mantiene las del Barrio 1: 70 + 4.
select pg_temp.ok((maintain_streets(pg_temp.barrio(1))).streets_state = 74, 'maintain_streets suma 4 puntos');
select pg_temp.ok((select streets_updated_at = now() from barrios where ordinal = 1), 'mantener guarda el estado y reinicia el reloj');
select pg_temp.ok((select (jornadas, ladrillo) = (5, 40) from players p join inventories i on i.player_id = p.id
                    where p.id = '11111111-1111-1111-1111-111111111111'), 'mantener cuesta 1 jornada y 10 de ladrillo');
select pg_temp.ok((select payload @> jsonb_build_object('barrio_id', pg_temp.barrio(1), 'points', 4, 'state', 74) from events
                    where type = 'streets.maintained'), 'streets.maintained lleva barrio, puntos y estado');
select pg_temp.err($$select maintain_streets(pg_temp.barrio(1))$$, 'STREETS_DONE_TODAY');
-- El de otro barrio sí se puede: el tope es por barrio.
select pg_temp.ok((maintain_streets(pg_temp.barrio(2))).streets_state = 4, 'se puede mantener cualquier barrio abierto');

-- B mantiene cerca del tope: suma solo lo que falta.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
update barrios set streets_state = 98, streets_updated_at = now() where ordinal = 1;
select pg_temp.ok((maintain_streets(pg_temp.barrio(1))).streets_state = 100, 'mantener tiene tope de 100');
select pg_temp.ok((select payload->>'points' = '2.00' from events
                    where type = 'streets.maintained' and actor_id = '22222222-2222-2222-2222-222222222222'),
                  'points lleva lo que sumó de verdad');

-- C no tiene ladrillo; y al día siguiente A puede de nuevo.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
update barrios set streets_state = 50 where ordinal = 1;
select pg_temp.err($$select maintain_streets(pg_temp.barrio(1))$$, 'NO_MATERIALS');
update players set jornadas = 0 where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.err($$select maintain_streets(pg_temp.barrio(1))$$, 'NO_JORNADAS');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update events set created_at = created_at - interval '1 day'
 where type = 'streets.maintained' and actor_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok((maintain_streets(pg_temp.barrio(1))).streets_state = 54, 'el tope se renueva con el día del juego');
select pg_temp.ok((invitation_map(pg_temp.tok()))->'barrios'->0 ? 'streets', 'invitation_map trae el estado de las calles');

-- ---------------------------------------------------------------------
-- Admin, invitaciones y NO_PLAYER
-- ---------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.err($$select admin_city_stats()$$, 'NOT_ADMIN');
select pg_temp.err($$select admin_force_open_barrio(gen_random_uuid())$$, 'NOT_ADMIN');
select pg_temp.err($$select admin_pending_notifications()$$, 'NOT_ADMIN');
select pg_temp.err($$select admin_mark_notified(array[1]::bigint[])$$, 'NOT_ADMIN');
select pg_temp.err($$select admin_invitations()$$, 'NOT_ADMIN');
update players set is_admin = true where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok((admin_city_stats())->>'players' = '3', 'admin_city_stats');

-- Outbox e invitaciones: el admin las ve por función porque no tienen lectura bajo RLS.
select pg_temp.ok(jsonb_array_length(admin_pending_notifications())
                  = (select count(*) from notifications_outbox where sent_at is null),
                  'admin_pending_notifications trae todo lo pendiente');
select pg_temp.ok((admin_pending_notifications(1))->0->>'display_name' is not null,
                  'admin_pending_notifications nombra al destinatario y respeta el límite');
select set_config('test.aviso', (admin_pending_notifications(1))->0->>'id', true);
select pg_temp.ok(admin_mark_notified(array[current_setting('test.aviso')::bigint]) = 1, 'admin_mark_notified marca el aviso');
select pg_temp.ok(admin_mark_notified(array[current_setting('test.aviso')::bigint]) = 0, 'admin_mark_notified es idempotente');
select pg_temp.ok((select sent_at is not null from notifications_outbox where id = current_setting('test.aviso')::bigint),
                  'el aviso marcado queda con sent_at');
select pg_temp.ok(jsonb_array_length(admin_invitations()) = (select count(*) from invitations where used_by is null),
                  'admin_invitations lista las que quedan sin usar');
-- En sentencias separadas: invitation_info es STABLE y no ve lo insertado en la misma sentencia.
select set_config('test.token', create_invitation(), true);
select pg_temp.ok((invitation_info(current_setting('test.token')))->>'inviter' = 'Facu', 'create_invitation + invitation_info');
select pg_temp.ok(invitation_info('no-existe') is null, 'invitation_info de un token inexistente');
select pg_temp.ok((invitation_map(current_setting('test.token')))->'barrios'->0 ? 'population',
                  'invitation_map trae la población de cada barrio');

select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select pg_temp.err($$select heartbeat()$$, 'NO_PLAYER');

rollback;
select 'Todas las pruebas pasaron.' as resultado, (select count(*) from players) as jugadores_tras_rollback;
