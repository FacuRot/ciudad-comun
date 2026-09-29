-- =====================================================================
--  Bots: 30 jugadores falsos que juegan 10 días simulados
--  (docs/08-plan-de-construccion.md, semana 5). Son 10 y no 3 para ver si el
--  Barrio 2 abre por población antes que por tiempo (docs/05 §16.4).
--
--  Para qué: ver que nada se rompe con gente encima y que los números de
--  docs/05-reglas-y-parametros.md §15 dan algo razonable antes de invitar
--  a nadie. Los datos quedan en la base para poder correr scripts/metrics.sql;
--  se borran con scripts/bots_cleanup.sql.
--
--    npx supabase db query --linked -f scripts/bots.sql
--    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/bots.sql
--
--  NO correr contra la base de la cohorte: el guardia del principio corta si
--  hay algún jugador que no sea bot. Usar una base local o una rama de Supabase.
--
--  Cómo se simula el tiempo: dentro de una transacción now() no se mueve, así
--  que el reloj corre al revés. Cada tick de 2 horas resta 2 horas a todas las
--  fechas guardadas, y entonces la producción, las obras y el decaimiento pasan
--  igual que en la vida real. Es la misma maña que usa tests/rpc.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ayudas (viven en la sesión, no en el esquema)
-- ---------------------------------------------------------------------
create temporary table if not exists bot_errors(code text);
create temporary table if not exists bot_quiet(player_id uuid);

-- Actuar como un jugador: las funciones leen auth.uid() de acá.
create or replace function pg_temp.as_bot(p uuid) returns void language plpgsql as $fn$
begin perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true); end $fn$;

-- Correr el reloj: todo lo guardado envejece p.
create or replace function pg_temp.advance(p interval) returns void language plpgsql as $fn$
begin
  update cities    set opened_at = opened_at - p;
  update barrios   set opened_at = opened_at - p, streets_updated_at = streets_updated_at - p where opened_at is not null;
  update players   set created_at = created_at - p, last_seen_at = last_seen_at - p;
  update lots      set claimed_at = claimed_at - p, production_collected_at = production_collected_at - p;
  update constructions set started_at = started_at - p, ends_at = ends_at - p, completed_at = completed_at - p;
  update construction_helps        set created_at = created_at - p;
  update public_works              set completed_at = completed_at - p where completed_at is not null;
  update public_work_contributions set created_at = created_at - p;
  update gifts      set created_at = created_at - p;
  update lot_cares  set created_at = created_at - p;
  update lot_visits set created_at = created_at - p;
  update invitations set created_at = created_at - p, expires_at = expires_at - p;
  update events     set created_at = created_at - p;
  update notifications_outbox set created_at = created_at - p, sent_at = sent_at - p;
end $fn$;

-- Pasar de día del juego: lo que mira el día (no la hora) también retrocede,
-- y ahí corren los jobs diarios en el orden de docs/05 §13. Cada uno se llama
-- dos veces: son idempotentes.
create or replace function pg_temp.new_day() returns void language plpgsql as $fn$
begin
  update lot_visits set day = day - 1;
  update events set payload = jsonb_set(payload, '{day}', to_jsonb(((payload->>'day')::date - 1)::text))
   where type in ('jornadas.refilled', 'barrio.population_changed');
  perform job_refill_jornadas();
  perform job_refill_jornadas();
  perform job_update_lot_states();
  perform job_update_lot_states();
  perform job_update_population();  -- revisa la apertura al terminar
  perform job_update_population();
  perform job_check_barrio_opening();
  perform job_check_barrio_opening();
end $fn$;

-- Una sesión de un bot: latido y una acción al azar. Los errores esperables
-- (se quedó sin jornadas, sin materiales, ya ayudó) se anotan y no cortan nada.
create or replace function pg_temp.act(p_bot uuid) returns void language plpgsql as $fn$
declare
  cid uuid; mine lots; target lots; c constructions; w public_works; other players; inv inventories;
  jornadas int; roll int; mat text; amount int; kind building_t;
begin
  perform pg_temp.as_bot(p_bot);
  select p.city_id, p.jornadas into cid, jornadas from players p where p.id = p_bot;
  select * into mine from lots where owner_id = p_bot;
  select * into inv from inventories where player_id = p_bot;

  begin
    perform heartbeat();
    roll := floor(random() * 100)::int;
    -- Sin jornadas solo quedan los gestos que no cuestan: regalar y pasar a ver.
    if jornadas < 1 then roll := 80 + floor(random() * 20)::int; end if;

    if roll < 30 then
      -- Construir o mejorar. El tipo se elige una sola vez, en el nivel 1, y el residencial
      -- elige ahí también el material del alquiler.
      kind := coalesce(mine.building_type,
                       (array['ladrilleria','aserradero','generador','plaza','residencial'])[(1 + floor(random() * 5))::int]::building_t);
      perform build(kind, case when kind = 'residencial' and mine.level = 0
                               then (array['ladrillo','madera','energia'])[(1 + floor(random() * 3))::int]::material_t end);

    elsif roll < 50 then
      -- Ayudar la construcción de un vecino.
      select c2.* into c from constructions c2 join lots l2 on l2.id = c2.lot_id
       where c2.completed_at is null and l2.owner_id <> p_bot
       order by random() limit 1;
      if c.id is not null then perform help_construction(c.id); end if;

    elsif roll < 64 then
      -- Aportar a la obra, con preferencia por la del propio barrio.
      select * into w from public_works
       where city_id = cid and status = 'en_curso'
       order by (barrio_id = mine.barrio_id) desc, random() limit 1;
      if w.id is not null then
        perform contribute(w.id,
                           floor(inv.ladrillo * random() * 0.6)::int,
                           floor(inv.madera   * random() * 0.6)::int,
                           floor(inv.energia  * random() * 0.6)::int);
      end if;

    elsif roll < 72 then
      -- Mantener las calles del propio barrio (a veces ya están al día, o ya las mantuvo hoy).
      perform maintain_streets(mine.barrio_id);

    elsif roll < 80 then
      -- Cuidar el lote de alguien que no viene.
      select * into target from lots
       where city_id = cid and status = 'ocupado' and state <> 'activo' and owner_id <> p_bot
       order by random() limit 1;
      if target.id is not null then perform care_lot(target.id); end if;

    elsif roll < 92 then
      -- Regalar un tercio de lo que tenga de un material.
      mat := (array['ladrillo','madera','energia'])[(1 + floor(random() * 3))::int];
      amount := (case mat when 'ladrillo' then inv.ladrillo when 'madera' then inv.madera else inv.energia end) / 3;
      select * into other from players where city_id = cid and id <> p_bot order by random() limit 1;
      if other.id is not null and amount >= 5 then perform gift(other.id, mat::material_t, amount); end if;

    else
      -- Pasar a ver un lote ajeno.
      select * into target from lots
       where city_id = cid and status = 'ocupado' and owner_id <> p_bot
       order by random() limit 1;
      if target.id is not null then perform visit_lot(target.id); end if;
    end if;
  exception when others then
    insert into pg_temp.bot_errors(code) values (left(sqlerrm, 60));
  end;
end $fn$;

-- ---------------------------------------------------------------------
-- La simulación
-- ---------------------------------------------------------------------
do $sim$
declare
  BOTS        constant int := 30;
  DAYS        constant int := 10;
  TICKS_A_DAY constant int := 12;          -- un tick son 2 horas
  TICK_LEN    constant interval := interval '2 hours';
  ACT_CHANCE  constant numeric := 0.22;    -- probabilidad de que un bot entre en un tick

  cid uuid; cfg jsonb; palette jsonb; dist int;
  uid uuid; prev uuid; prev_lot uuid; tok text; lot_id uuid;
  i int; day int; tick int; bot record;
  n_real int; n_free int; known text[];
begin
  -- Guardia: esto no se corre sobre gente de verdad.
  select count(*) into n_real from players p
    left join auth.users u on u.id = p.id
   where coalesce(u.email, '') not like '%@bots.local';
  if n_real > 0 then
    raise exception 'Hay % jugadores que no son bots: no corras esto sobre la base de la cohorte.', n_real;
  end if;

  -- Repetir la corrida sobre bots viejos mezclaría dos simulaciones.
  if exists (select 1 from players) then
    raise exception 'Ya hay jugadores: corré scripts/bots_cleanup.sql antes de repetir la simulación.';
  end if;
  delete from bot_errors;
  delete from bot_quiet;

  select id, config into cid, cfg from cities order by opened_at limit 1;
  if cid is null then raise exception 'No hay ciudad: corré el seed primero.'; end if;
  palette := cfg -> 'palette';
  dist := (cfg #>> '{lots,max_claim_distance}')::int;

  select count(*) into n_free from lots where city_id = cid and status = 'libre';
  if n_free < BOTS then
    raise exception 'Faltan lotes libres: hay % y hacen falta %.', n_free, BOTS;
  end if;

  -- Día 0: cada bot entra invitado por el anterior y funda cerca de sus vecinos.
  for i in 1..BOTS loop
    select l.id into lot_id from lots l
     where l.city_id = cid and l.status = 'libre'
       and (not exists (select 1 from lots o where o.city_id = cid and o.status = 'ocupado')
            or exists (select 1 from lots o
                        where o.city_id = cid and o.status = 'ocupado' and o.state <> 'abandonado'
                          and abs(o.x - l.x) + abs(o.y - l.y) <= dist))
     order by random() limit 1;
    exit when lot_id is null;

    uid := gen_random_uuid();
    insert into auth.users(id, email) values (uid, format('bot%s@bots.local', lpad(i::text, 2, '0')));
    insert into invitations(city_id, inviter_id, lot_hint) values (cid, prev, prev_lot) returning invitations.token into tok;

    perform pg_temp.as_bot(uid);
    perform claim_lot(tok,
                      format('bot-%s', lpad(i::text, 2, '0')),
                      lot_id,
                      format('Lote bot %s', lpad(i::text, 2, '0')),
                      palette ->> (floor(random() * jsonb_array_length(palette)))::int);
    prev := uid;
    prev_lot := lot_id;
  end loop;

  raise notice 'Fundaron % bots.', (select count(*) from players);

  -- Los días. Cada tick: corre el reloj, terminan las obras que vencieron
  -- y algunos bots entran a jugar.
  for day in 1..DAYS loop
    for tick in 1..TICKS_A_DAY loop
      perform pg_temp.advance(TICK_LEN);
      perform job_complete_constructions();
      perform job_complete_constructions();
      for bot in select id from players order by random() loop
        continue when exists (select 1 from bot_quiet q where q.player_id = bot.id);
        continue when random() > ACT_CHANCE;
        perform pg_temp.act(bot.id);
      end loop;
    end loop;

    -- Arrancando el día 2, cuatro bots dejan de venir: es lo que hace aparecer
    -- lotes descuidados y abandonados, y da algo para cuidar. Uno de ellos
    -- hace tanto que no viene que su lote queda abandonado.
    if day = 1 then
      insert into bot_quiet(player_id) select id from players order by random() limit 4;
      update players set last_seen_at = last_seen_at - interval '5 days'
       where id in (select player_id from bot_quiet);
      update players set last_seen_at = last_seen_at - interval '4 days'
       where id = (select player_id from bot_quiet order by player_id limit 1);
    end if;

    perform pg_temp.new_day();
    -- Por barrio abierto: población de hoy, objetivo, atractivo, lo que más resta y calles.
    raise notice 'Día % listo. %', day,
      (select string_agg(format('%s: %s de %s ciudadanos (capacidad %s, atractivo %s, resta %s) · calles %s',
                                b.name, e.payload->>'to', e.payload->>'target', e.payload->>'capacity',
                                e.payload->>'attractiveness', coalesce(e.payload->>'main_reason', 'nada'),
                                round(fx_streets_state(b.id))), ' | ' order by b.ordinal)
         from barrios b
         join lateral (select payload from events
                        where type = 'barrio.population_changed' and payload->>'barrio_id' = b.id::text
                        order by created_at desc, id desc limit 1) e on true
        where b.status = 'abierto');
  end loop;

  -- ------------------------------------------------------------------
  -- Qué pasó (las señales de docs/05 §15)
  -- ------------------------------------------------------------------
  perform pg_temp.as_bot(null);
  raise notice '--- Después de % días simulados ---', DAYS;
  raise notice 'Jugadores: % · sesiones: % · lotes ocupados: %',
    (select count(*) from players),
    (select count(*) from events where type = 'session.started'),
    (select count(*) from lots where status = 'ocupado');
  raise notice 'Lotes por estado: %',
    (select string_agg(state::text || ' ' || n, ' · ') from (select state, count(*) n from lots where status = 'ocupado' group by state order by state) s);
  raise notice 'Niveles: %',
    (select string_agg('nivel ' || level || ' ' || n, ' · ') from (select level, count(*) n from lots where status = 'ocupado' group by level order by level) s);
  raise notice 'Edificios: %',
    (select coalesce(string_agg(building_type::text || ' ' || n, ' · '), 'ninguno')
       from (select building_type, count(*) n from lots where level > 0 group by building_type order by building_type) s);
  raise notice 'Jornadas gastadas: % · colectivas: % %%',
    (select count(*) from events where type in ('construction.started','construction.helped','public_work.contributed','lot.cared','streets.maintained')),
    (select round(count(*) filter (where type in ('construction.helped','public_work.contributed','lot.cared','streets.maintained')) * 100.0
                  / nullif(count(*), 0))
       from events where type in ('construction.started','construction.helped','public_work.contributed','lot.cared','streets.maintained'));
  raise notice 'Barrio 2: %',
    -- Abre al cerrar un día; de ahí en más su evento envejece un día por día simulado.
    coalesce((select format('abrió el día %s por %s', DAYS - round(extract(epoch from (now() - e.created_at)) / 86400.0)::int,
                            e.payload->>'reason')
                from events e where e.type = 'barrio.opened' order by e.created_at limit 1),
             'sigue cerrado');
  raise notice 'Calles: % · mantenimientos: % de % jugadores distintos',
    (select string_agg(name || ' ' || round(fx_streets_state(id)), ' · ' order by ordinal) from barrios where status = 'abierto'),
    (select count(*) from events where type = 'streets.maintained'),
    (select count(distinct actor_id) from events where type = 'streets.maintained');
  raise notice 'Regalos: % (% unidades) · cuidados: % · visitas: %',
    (select count(*) from gifts), (select coalesce(sum(amount), 0) from gifts),
    (select count(*) from lot_cares), (select count(*) from events where type = 'lot.visited');
  raise notice 'En el tope de jornadas: % de %',
    (select count(*) from players p, cities c where c.id = p.city_id and p.jornadas >= (c.config #>> '{jornadas,cap}')::int),
    (select count(*) from players);
  raise notice 'Obras: %',
    (select string_agg(name || ' ' || status || ' jornadas ' || (progress->>'jornadas') || '/' || (cost->>'jornadas'), ' · ') from public_works);
  raise notice 'Avisos encolados: % · barrios abiertos: %',
    (select count(*) from notifications_outbox),
    (select count(*) from barrios where status = 'abierto');

  -- Los errores esperados son parte del juego (te quedaste sin jornadas).
  -- Cualquier otro es un bug y sale con warning.
  known := array['NO_JORNADAS','NO_MATERIALS','ALREADY_BUILDING','MAX_LEVEL','NO_CONSTRUCTION',
                 'LOT_NOT_NEGLECTED','CARE_LIMIT','GIFT_TOO_SMALL','NO_WORK','TYPE_LOCKED',
                 'STREETS_FULL','STREETS_DONE_TODAY','WORK_NEEDS_MATERIALS'];
  for bot in select code, count(*) n from bot_errors group by code order by count(*) desc loop
    if bot.code = any(known) then
      raise notice 'Rechazo esperado % × %', bot.n, bot.code;
    else
      raise warning 'REVISAR: % × %', bot.n, bot.code;
    end if;
  end loop;
end $sim$;
