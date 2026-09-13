# 09 · Experimento y métricas

Tres semanas, una cohorte, umbrales fijados antes de arrancar. El objetivo no es que el juego "ande bien": es saber si la hipótesis de `02-alcance-prototipo.md` se sostiene.

## Hipótesis y umbrales (fijar antes de invitar a nadie)

| # | Pregunta | Métrica | Umbral | Si falla, el problema está en… |
|---|----------|---------|--------|--------------------------------|
| H1 | ¿Vuelven? | De los que completaron la primera sesión (fundaron lote y gastaron ≥ 1 jornada), % que entra en el día 3 o después | > 50 % | el loop personal (producción, tiempos, resumen) |
| H2 | ¿Actúan sobre lo colectivo? | Jornadas gastadas en ayudar + aportar + cuidar sobre jornadas totales gastadas | ≥ 33 % | el corazón: la interdependencia no se siente |
| H3 | ¿Hablan? | Mensajes en el grupo de WhatsApp no iniciados por el equipo, por día, de la semana 2 en adelante | ≥ 3 por día en promedio | el corazón: no hay motivo para coordinar |

Las tres tienen que cumplirse. H1 sola es un juego idle más. H2 y H3 sin H1 es una comunidad que se aburre.

### Métricas secundarias (informan, no deciden)

- Retención día 7 y día 14 sobre la misma base.
- % de jugadores que regalaron al menos una vez. % que recibieron.
- Días hasta completar la Escuela. Si no se completa: % de progreso al día 21.
- Distribución de tipos de edificio (¿alguien elige plaza?).
- Jornadas sin usar: % de jugadores que llegan al tope de 6 (señal de "no tengo qué hacer").
- Lotes que llegan a `descuidado` y `abandonado`; cuántos reciben cuidado.
- Visitas a lotes ajenos por sesión.
- Tasa de conversión de invitación: links creados por jugadores → usados.
- Efecto de la apertura del Barrio 2: sesiones en las 48 h posteriores vs. las 48 h anteriores.

## Reclutamiento

**Tamaño:** 40 a 60 personas que completen la primera sesión. Para eso hacen falta unas 80 a 100 invitaciones (estimando 50–60 % de conversión con gente conocida y menos con desconocidos).

**Mezcla:** un tercio conocidos directos del equipo, dos tercios que no se conozcan entre sí. Formas de conseguir a los desconocidos sin gastar plata: pedir a cada conocido que invite a una persona que el equipo no conozca (la mecánica de invitar ya lo permite), comunidades locales donde el equipo ya participa, y grupos de interés en juegos de navegador o de construcción. Evitar traer solo gente del mismo círculo.

**Mensaje de invitación (borrador):**

> Estoy probando un jueguito de navegador con un grupo chico: una ciudad que construimos entre todos, cada uno con su lote. Son 5 minutos por día durante 3 semanas, y después te pregunto qué te pareció. Te guardé un lote al lado del mío: <link>

**Onboarding:** cada nuevo entra al grupo de WhatsApp al fundar su lote. El equipo hace de padrino en las primeras 48 h de cada uno: una ayuda o un regalo, y un mensaje de bienvenida en el grupo nombrando su lote.

## Calendario

| Día | Qué pasa |
|-----|----------|
| 0 | El equipo (3 personas) ya fundó. Se mandan las primeras 30 invitaciones a conocidos. |
| 1–3 | Padrinazgo intensivo. Se mandan las invitaciones a desconocidos a medida que hay vecinos activos cerca de lotes libres. |
| 4–9 | Observación. No se interviene salvo bugs. Se registra cada día la hoja de seguimiento. |
| ~10 | Se abre el Barrio 2 (por umbral o por tiempo). Se observa el efecto 48 h. |
| 11–20 | Observación. Segunda tanda de invitaciones solo si hay lotes libres con vecinos. |
| 21 | Cierre. Se corren las consultas finales. |
| 22–28 | Entrevistas de cierre (8 a 10 personas). Escritura del informe. |

## Rituales del equipo

**Diario (15 minutos):** correr la hoja de seguimiento (consultas de abajo), leer el grupo de WhatsApp, revisar `notifications_outbox` pendientes, hacer de padrino de los nuevos de las últimas 24 h.

**Cada 3 días:** leer los `events` de 5 jugadores al azar de principio a fin y escribir dos líneas sobre qué hicieron y qué no. Esto encuentra cosas que las métricas agregadas no muestran.

**Regla de intervención:** no se cambia ninguna regla del juego durante el experimento salvo que haya un bug que impida jugar o un desbalance evidente (ver `05-reglas-y-parametros.md` §15). Todo cambio en `cities.config` se anota con fecha en `docs/cambios-experimento.md`.

## Consultas SQL (`scripts/metrics.sql`)

Todas asumen una sola ciudad. `:start` es `cities.opened_at`.

```sql
-- Base: jugadores que completaron la primera sesión (fundaron y gastaron ≥ 1 jornada el mismo día)
create or replace view v_base as
select p.id, p.display_name, p.created_at
  from players p
 where not p.is_admin
   and exists (select 1 from events e where e.actor_id = p.id
                and e.type in ('construction.started','public_work.contributed','construction.helped','lot.cared')
                and e.created_at < p.created_at + interval '1 day');

-- H1: retención día 3 (volvió el día 3 o después, medido en días de calendario desde su alta)
select count(*) filter (where returned) * 100.0 / count(*) as retencion_d3_pct
  from (
    select b.id, exists (
      select 1 from events e where e.actor_id = b.id and e.type = 'session.started'
         and e.created_at >= date_trunc('day', b.created_at) + interval '3 days'
    ) as returned
    from v_base b
  ) t;

-- Retención por día (curva)
select d as dia, count(distinct b.id) as jugadores
  from v_base b
  join events e on e.actor_id = b.id and e.type = 'session.started'
  cross join lateral (select floor(extract(epoch from (e.created_at - date_trunc('day', b.created_at)))/86400)::int d) x
 group by d order by d;

-- H2: proporción de jornadas colectivas
select
  count(*) filter (where type in ('construction.helped','public_work.contributed','lot.cared')) * 100.0
  / nullif(count(*), 0) as jornadas_colectivas_pct,
  count(*) as jornadas_totales
  from events
 where type in ('construction.started','construction.helped','public_work.contributed','lot.cared')
   and actor_id in (select id from v_base);

-- H2 por jugador (distribución)
select actor_id, p.display_name,
       count(*) filter (where type <> 'construction.started') as colectivas,
       count(*) as totales
  from events e join players p on p.id = e.actor_id
 where type in ('construction.started','construction.helped','public_work.contributed','lot.cared')
 group by actor_id, p.display_name order by colectivas desc;

-- Regalos: quién dio, quién recibió
select count(distinct from_player) as regalaron, count(distinct to_player) as recibieron, count(*) as regalos, sum(amount) as unidades from gifts;

-- Jornadas sin usar: jugadores en el tope
select count(*) filter (where jornadas >= 6) * 100.0 / count(*) as en_tope_pct from players where not is_admin;

-- Obras públicas
select name, status, progress, cost, completed_at - (select opened_at from cities) as tiempo_hasta_completar from public_works;

-- Placa de una obra
select p.display_name, count(*) as aportes, sum(c.ladrillo + c.madera + c.energia) as materiales
  from public_work_contributions c join players p on p.id = c.player_id
 where c.public_work_id = :work_id group by p.display_name order by aportes desc;

-- Tipos de edificio elegidos
select building_type, count(*) from lots where level > 0 group by 1;

-- Decaimiento y cuidado
select state, count(*) from lots where status = 'ocupado' group by 1;
select count(distinct lot_id) as lotes_cuidados, count(*) as cuidados, count(distinct carer_id) as cuidadores from lot_cares;

-- Visitas por sesión
select count(*)::numeric / nullif((select count(*) from events where type = 'session.started'), 0) as visitas_por_sesion
  from events where type = 'lot.visited';

-- Invitaciones creadas por jugadores y usadas
select count(*) as creadas, count(used_by) as usadas from invitations where inviter_id is not null;

-- Efecto apertura Barrio 2: sesiones 48 h antes vs 48 h después
with o as (select created_at t from events where type = 'barrio.opened' limit 1)
select count(*) filter (where e.created_at between o.t - interval '48 hours' and o.t) as antes,
       count(*) filter (where e.created_at between o.t and o.t + interval '48 hours') as despues
  from events e, o where e.type = 'session.started';

-- Hoja diaria: una fila por día
select date_trunc('day', created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       count(distinct actor_id) filter (where type = 'session.started') as activos,
       count(*) filter (where type = 'player.joined') as nuevos,
       count(*) filter (where type = 'construction.started') as construcciones,
       count(*) filter (where type in ('construction.helped','public_work.contributed','lot.cared')) as jornadas_colectivas,
       count(*) filter (where type = 'gift.sent') as regalos
  from events group by 1 order by 1;
```

## Entrevistas de cierre

8 a 10 personas: 3 que volvieron mucho, 3 que abandonaron antes del día 7, 2 que aportaron mucho a lo colectivo, 2 que solo construyeron lo suyo. 20 minutos, por llamada o audio de WhatsApp. Preguntas abiertas, en este orden:

1. Contame la última vez que entraste. ¿Qué hiciste?
2. ¿Qué te hacía volver? (o: ¿en qué momento dejaste de entrar? ¿qué pasó ese día?)
3. ¿Hubo algún momento en que alguien hizo algo por vos, o vos por alguien? ¿Cómo fue?
4. ¿Sentías que la ciudad era de todos, tuya, o de nadie?
5. ¿Qué querías hacer y no pudiste?
6. Si mañana abriera una ciudad nueva, ¿entrarías? ¿Con quién?

No se pregunta "¿qué te gustaría que agreguemos?": la gente pide funcionalidades y lo que se necesita saber es qué sintió.

## Informe de cierre

Una página: las tres hipótesis con su número y su umbral; las secundarias que sorprendieron; tres citas de entrevistas; y una decisión de las tres posibles: **seguir** (las tres se cumplen: pasar a cohorte 2 con lo que quedó afuera), **ajustar** (una falla y se entiende por qué: cambiar eso y repetir con cohorte nueva), o **parar** (falla el corazón sin explicación clara). La decisión se toma con los números fijados de antemano, no con la sensación de la última semana.
