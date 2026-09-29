-- =====================================================================
--  Las consultas del experimento (docs/09-experimento-y-metricas.md).
--  Una sola ciudad. Todo sale de events, así que no hay nada que instrumentar.
--
--    npx supabase db query --linked -f scripts/metrics.sql
--    psql "$DATABASE_URL" -f scripts/metrics.sql
--
--  Se corren enteras al cierre (día 21) y por partes en el ritual diario.
--  No crean nada en la base: la base de jugadores va como CTE en cada consulta,
--  en lugar de la vista v_base del documento, para no tocar el esquema de la
--  ciudad mientras corre el experimento.
--
--  La base: quienes completaron la primera sesión (fundaron y gastaron al menos
--  una jornada el mismo día). El equipo no cuenta.
--  H3 (mensajes en el grupo de WhatsApp) se cuenta a mano: no está en la base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- H1 · ¿Vuelven? Umbral: > 50 % entra el día 3 o después.
-- ---------------------------------------------------------------------
with base as (
  select p.id, p.created_at from players p
   where not p.is_admin
     and exists (select 1 from events e
                  where e.actor_id = p.id
                    and e.type in ('construction.started','public_work.contributed','construction.helped','lot.cared','streets.maintained')
                    and e.created_at < p.created_at + interval '1 day')
)
select count(*) as base_jugadores,
       round(count(*) filter (where d3) * 100.0 / nullif(count(*), 0), 1) as retencion_d3_pct,
       round(count(*) filter (where d7) * 100.0 / nullif(count(*), 0), 1) as retencion_d7_pct,
       round(count(*) filter (where d14) * 100.0 / nullif(count(*), 0), 1) as retencion_d14_pct
  from (
    select b.id,
           exists (select 1 from events e where e.actor_id = b.id and e.type = 'session.started'
                    and e.created_at >= date_trunc('day', b.created_at) + interval '3 days')  as d3,
           exists (select 1 from events e where e.actor_id = b.id and e.type = 'session.started'
                    and e.created_at >= date_trunc('day', b.created_at) + interval '7 days')  as d7,
           exists (select 1 from events e where e.actor_id = b.id and e.type = 'session.started'
                    and e.created_at >= date_trunc('day', b.created_at) + interval '14 days') as d14
      from base b
  ) t;

-- Curva de retención: cuántos de la base entraron en cada día desde su alta.
with base as (
  select p.id, p.created_at from players p
   where not p.is_admin
     and exists (select 1 from events e
                  where e.actor_id = p.id
                    and e.type in ('construction.started','public_work.contributed','construction.helped','lot.cared','streets.maintained')
                    and e.created_at < p.created_at + interval '1 day')
)
select x.d as dia, count(distinct b.id) as jugadores
  from base b
  join events e on e.actor_id = b.id and e.type = 'session.started'
  cross join lateral (select floor(extract(epoch from (e.created_at - date_trunc('day', b.created_at))) / 86400)::int as d) x
 group by x.d
 order by x.d;

-- ---------------------------------------------------------------------
-- H2 · ¿Actúan sobre lo colectivo? Umbral: ≥ 33 % de las jornadas gastadas.
-- ---------------------------------------------------------------------
with base as (
  select p.id from players p
   where not p.is_admin
     and exists (select 1 from events e
                  where e.actor_id = p.id
                    and e.type in ('construction.started','public_work.contributed','construction.helped','lot.cared','streets.maintained')
                    and e.created_at < p.created_at + interval '1 day')
)
select count(*) as jornadas_totales,
       count(*) filter (where type in ('construction.helped','public_work.contributed','lot.cared','streets.maintained')) as jornadas_colectivas,
       round(count(*) filter (where type in ('construction.helped','public_work.contributed','lot.cared','streets.maintained')) * 100.0
             / nullif(count(*), 0), 1) as jornadas_colectivas_pct
  from events
 where type in ('construction.started','construction.helped','public_work.contributed','lot.cared','streets.maintained')
   and actor_id in (select id from base);

-- H2 por jugador: quién sostiene lo colectivo y quién solo lo suyo.
select p.display_name,
       count(*) filter (where e.type <> 'construction.started') as colectivas,
       count(*) as totales
  from events e join players p on p.id = e.actor_id
 where e.type in ('construction.started','construction.helped','public_work.contributed','lot.cared','streets.maintained')
 group by p.display_name
 order by colectivas desc, totales desc;

-- ---------------------------------------------------------------------
-- Secundarias
-- ---------------------------------------------------------------------

-- Regalos: quién dio, quién recibió, cuánto se movió.
select count(distinct from_player) as regalaron,
       count(distinct to_player)   as recibieron,
       count(*)                    as regalos,
       sum(amount)                 as unidades
  from gifts;

-- Jornadas sin usar: qué porcentaje llega al tope (señal de "no tengo qué hacer").
select count(*) filter (where p.jornadas >= (c.config #>> '{jornadas,cap}')::int) as en_tope,
       count(*) as jugadores,
       round(count(*) filter (where p.jornadas >= (c.config #>> '{jornadas,cap}')::int) * 100.0
             / nullif(count(*), 0), 1) as en_tope_pct
  from players p join cities c on c.id = p.city_id
 where not p.is_admin;

-- Obras públicas: progreso y cuánto tardaron desde que abrió la ciudad.
select w.name, w.status,
       w.progress, w.cost,
       w.completed_at - c.opened_at as tiempo_hasta_completar
  from public_works w join cities c on c.id = w.city_id
 order by w.name;

-- Placa de una obra: cambiar el nombre por el de la obra que se quiera mirar.
select p.display_name,
       count(*) as aportes,
       sum(k.ladrillo + k.madera + k.energia) as materiales
  from public_work_contributions k
  join players p on p.id = k.player_id
  join public_works w on w.id = k.public_work_id
 where w.name = 'Escuela'
 group by p.display_name
 order by aportes desc, materiales desc;

-- Tipos de edificio elegidos (¿alguien elige plaza?).
select building_type, level, count(*) as lotes
  from lots where level > 0
 group by building_type, level
 order by building_type, level;

-- Decaimiento: en qué estado están los lotes ocupados.
select state, count(*) as lotes
  from lots where status = 'ocupado'
 group by state
 order by state;

-- Cuidado: cuántos lotes recibieron cuidado y de cuánta gente.
select count(distinct lot_id) as lotes_cuidados,
       count(*)               as cuidados,
       count(distinct carer_id) as cuidadores
  from lot_cares;

-- Visitas a lotes ajenos por sesión.
select round(count(*)::numeric / nullif((select count(*) from events where type = 'session.started'), 0), 2)
       as visitas_por_sesion
  from events where type = 'lot.visited';

-- Invitaciones que reparten los jugadores: cuántas se usan.
select count(*) as creadas,
       count(used_by) as usadas,
       round(count(used_by) * 100.0 / nullif(count(*), 0), 1) as conversion_pct
  from invitations
 where inviter_id is not null;

-- Efecto de la apertura del Barrio 2: sesiones 48 h antes y 48 h después.
with o as (select created_at as t from events where type = 'barrio.opened' order by created_at limit 1)
select count(*) filter (where e.created_at between o.t - interval '48 hours' and o.t) as antes,
       count(*) filter (where e.created_at between o.t and o.t + interval '48 hours') as despues
  from events e, o
 where e.type = 'session.started';

-- ---------------------------------------------------------------------
-- Hoja de seguimiento diario: una fila por día del juego.
-- ---------------------------------------------------------------------
select date_trunc('day', e.created_at at time zone (select timezone from cities order by opened_at limit 1))::date as dia,
       count(distinct e.actor_id) filter (where e.type = 'session.started') as activos,
       count(*) filter (where e.type = 'player.joined')             as nuevos,
       count(*) filter (where e.type = 'construction.started')      as construcciones,
       count(*) filter (where e.type = 'construction.completed')    as terminadas,
       count(*) filter (where e.type in ('construction.helped','public_work.contributed','lot.cared','streets.maintained')) as jornadas_colectivas,
       count(*) filter (where e.type = 'gift.sent')                 as regalos,
       count(*) filter (where e.type = 'lot.visited')               as visitas
  from events e
 group by dia
 order by dia;

-- Avisos que quedaron sin mandar (el ritual diario los revisa).
select type, count(*) as pendientes, min(created_at) as el_mas_viejo
  from notifications_outbox where sent_at is null
 group by type order by pendientes desc;
