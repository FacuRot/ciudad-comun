# 04 · Modelo de datos

Postgres en Supabase. El SQL ejecutable completo (tablas, índices, RLS, funciones, cron) está en `schema.sql`. Este documento explica el modelo y sus invariantes.

## Diagrama

```
auth.users ──1:1── players ──1:1── inventories
                      │
                      │ owner_id (0..1)
cities ──1:N── barrios ──1:N── lots ──1:N── constructions ──1:N── construction_helps
   │                                 │
   │                                 ├──1:N── lot_cares
   │                                 └──1:N── lot_visits
   ├──1:N── public_works ──1:N── public_work_contributions
   ├──1:N── invitations
   ├──1:N── gifts
   ├──1:N── events
   └──1:N── notifications_outbox
```

## Tablas

### `cities`
Una fila en el prototipo. `config` (JSONB) contiene todos los parámetros de `05-reglas-y-parametros.md` §14. `timezone` define el día del juego. `opened_at` marca el inicio del experimento y se usa para la apertura del Barrio 2 por tiempo.

### `barrios`
Dos filas. `status` es `cerrado` o `abierto`. Al abrirse, sus lotes pasan de `cerrado` a `libre`.

### `lots`
Un lote por celda construible. Campos clave:

- `x`, `y`: posición en la grilla 12×8. Únicos por ciudad.
- `status`: `cerrado` (barrio no abierto), `libre`, `ocupado`.
- `owner_id`: jugador dueño; NULL si libre.
- `name`, `color`: elegidos por el dueño. `name` único por ciudad.
- `building_type`, `level`: NULL/0 hasta construir el nivel 1. `level` sube solo al completarse una construcción.
- `state`: `activo`, `descuidado`, `abandonado`. Lo recalcula el cron diario y `heartbeat()` al entrar el dueño.
- `production_collected_at`: desde cuándo hay producción sin recoger. Se usa para el cálculo perezoso.
- `care_days`, `care_count`: días de gracia acumulados y cantidad de cuidados en la ausencia actual. Se reinician cuando el dueño vuelve.

Invariante: un jugador tiene como máximo un lote (`UNIQUE (owner_id)`).

### `players`
`id` es el mismo UUID que `auth.users.id`. `display_name` es el apodo público. `jornadas` es el saldo actual. `last_seen_at` es la base del decaimiento y del resumen. `invited_by` referencia al invitador. `is_admin` habilita las funciones de administración.

### `inventories`
Una fila por jugador con `ladrillo`, `madera`, `energia` (enteros ≥ 0, con CHECK). Separada de `players` para que las funciones hagan `UPDATE ... SET ladrillo = ladrillo - x` con verificación de saldo en la misma sentencia.

### `constructions`
Una por mejora en curso o terminada. `target_level`, `building_type`, `started_at`, `ends_at`, `completed_at`. Solo puede haber una con `completed_at IS NULL` por lote (índice único parcial). Las ayudas restan horas a `ends_at`.

### `construction_helps`
Quién ayudó qué construcción. `UNIQUE (construction_id, helper_id)` implementa el máximo de una ayuda por jugador.

### `public_works`
Una por barrio. `cost` y `progress` son JSONB con las cuatro claves (`ladrillo`, `madera`, `energia`, `jornadas`). `status`: `en_curso` o `completada`. Se completa cuando `progress >= cost` en las cuatro claves.

### `public_work_contributions`
Un aporte = una jornada. Guarda los materiales entregados. La placa se arma con `GROUP BY player_id ORDER BY COUNT(*) DESC`.

### `gifts`, `lot_cares`, `lot_visits`
Registros de los tres gestos. `lot_visits` tiene clave primaria `(visitor_id, lot_id, day)` para limitar a una visita por día.

### `invitations`
`token` de un solo uso, `expires_at` a 7 días, `lot_hint` con el lote del invitador para sugerir vecindad. `used_by` se completa al usarlo.

### `events`
La tabla más importante para el experimento. Una fila por acción relevante:

| `type` | `actor_id` | `lot_id` | `target_player_id` | `payload` |
|--------|------------|----------|--------------------|-----------|
| `player.joined` | nuevo | su lote | invitador | `{display_name}` |
| `lot.claimed` | dueño | lote | — | `{name, color}` |
| `lot.renamed` / `lot.recolored` | dueño | lote | — | `{name}` / `{color}` |
| `construction.started` | dueño | lote | — | `{building_type, target_level, ends_at}` |
| `construction.helped` | ayudante | lote | dueño | `{construction_id, new_ends_at}` |
| `construction.completed` | — (sistema) | lote | dueño | `{building_type, level}` |
| `public_work.contributed` | aportante | — | — | `{public_work_id, ladrillo, madera, energia}` |
| `public_work.completed` | — | — | — | `{public_work_id, name}` |
| `lot.cared` | cuidador | lote | dueño | `{care_count}` |
| `gift.sent` | emisor | — | receptor | `{material, amount}` |
| `lot.visited` | visitante | lote | dueño | `{}` |
| `lot.state_changed` | — | lote | dueño | `{from, to}` |
| `barrio.opened` | — | — | — | `{barrio_id, name, reason}` |
| `production.collected` | dueño | lote | — | `{material, amount}` |
| `session.started` | jugador | — | — | `{hours_away}` |
| `jornadas.refilled` | — (sistema) | — | — | `{day}` · una por ciudad por día del juego; hace idempotente a `job_refill_jornadas` |

Índices por `(city_id, created_at)`, `(target_player_id, created_at)` y `(actor_id, created_at)`. De acá salen el resumen, la placa, las visitas y todas las métricas.

### `notifications_outbox`
Lo que el sistema *querría* notificar (construcción terminada, vecino nuevo, regalo recibido). Un script externo lee filas con `sent_at IS NULL`, envía email y marca. Si el script no existe, el equipo lee la tabla y avisa a mano. Es la implementación del Mago de Oz.

## Funciones RPC (contrato en `06-acciones-y-api.md`)

Públicas (llamadas desde el cliente, `SECURITY DEFINER`, validan `auth.uid()`):
`claim_lot`, `rename_lot`, `recolor_lot`, `build`, `help_construction`, `contribute`, `care_lot`, `gift`, `visit_lot`, `heartbeat`, `get_summary`, `create_invitation`.

Públicas para `anon` (pantalla de entrada, antes de tener jugador): `invitation_info`, `invitation_map`.

Administración (verifican `players.is_admin`):
`admin_open_barrio`, `admin_city_stats`.

Internas (no expuestas, usadas por las anteriores y por cron):
`fx_config`, `fx_collect_production`, `fx_effective_rate`, `fx_lot_state`, `fx_log_event`, `job_refill_jornadas`, `job_update_lot_states`, `job_complete_constructions`, `job_check_barrio_opening`.

## Seguridad (RLS)

- `SELECT` permitido para autenticados en todas las tablas del juego, filtrado por `city_id` del jugador (en el prototipo hay una sola ciudad, pero el filtro queda desde el inicio).
- `inventories` y `players.email`: solo el propio jugador ve su inventario y su email; el resto ve `display_name`, `jornadas` no.
- Ningún `INSERT`/`UPDATE`/`DELETE` para el rol `authenticated`. Todo pasa por funciones.
- `notifications_outbox` y `invitations` no son legibles por jugadores comunes (solo por `service_role` y admins).

## Realtime

Publicación de Supabase Realtime activada para `lots`, `constructions`, `public_works`, `barrios` y `events`. El cliente se suscribe a las cuatro primeras para redibujar y a `events` filtrado por `target_player_id = auth.uid()` para avisos en vivo.

## Seed

`seed.sql` crea: la ciudad con su `config`; dos barrios; la grilla 12×8 con calle en la fila 4 y en la columna 6 (las celdas de calle no son lotes), asignando 41 lotes al Barrio 1 (columnas 0–5, con la Escuela en la celda 2,3) y 34 al Barrio 2 (columnas 7–11, con el Hospital en la celda 9,3); las dos obras públicas con progreso cero; y un jugador admin.
