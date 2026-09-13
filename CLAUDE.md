# CLAUDE.md — Ciudad Común (prototipo)

City builder de navegador donde todos los jugadores construyen la misma ciudad. Este repo es el **prototipo de validación**, no el juego completo. Leé `docs/README.md` primero; el alcance está cerrado en `docs/02-alcance-prototipo.md`.

## Regla número uno

**No ampliar el alcance.** Si una tarea pide algo que no está en `docs/02-alcance-prototipo.md` (mercado, múltiples ciudades, ruinas, cosméticos, chat, push, app móvil, arte), no lo implementes: anotalo en `docs/despues.md` con una línea y seguí. Si una mejora parece obvia, preguntá antes de hacerla.

## Dónde está cada cosa

- Reglas del juego y números: `docs/05-reglas-y-parametros.md`. Los números viven en `cities.config` (JSONB); nunca los hardcodees en cliente ni en funciones.
- Contrato de cada acción: `docs/06-acciones-y-api.md`. Códigos de error y su mensaje.
- Esquema y funciones SQL: `supabase/migrations/` (origen: `docs/schema.sql`).
- Pantallas y comportamiento de UI: `docs/07-pantallas-y-flujos.md`.
- Plan por semanas: `docs/08-plan-de-construccion.md`.

## Arquitectura (no negociable en el prototipo)

- **Toda mutación del juego es una función Postgres** (`SECURITY DEFINER`, valida `auth.uid()`, escribe en `events`). El cliente **nunca** hace `insert`/`update` directo. Si necesitás una acción nueva, es una migración con una función nueva más su wrapper en `web/src/api/`.
- Las funciones nunca reciben `player_id` por parámetro.
- La producción es perezosa: se calcula en `fx_collect_production` a partir de `production_collected_at`. No agregues jobs que acumulen materiales.
- El mapa es canvas 2D con redibujo total. No agregues motores (Pixi, Phaser, Three) ni optimizaciones de render.
- Realtime de Supabase con fallback de polling cada 30 s. No agregues WebSockets propios ni un backend en Node.
- Hora del juego: `cities.timezone` (`America/Argentina/Buenos_Aires`). El cron está en UTC; 00:00 ART = 03:00 UTC.

## Stack

Vite + React + TypeScript · Zustand · supabase-js · Canvas 2D · Supabase (Postgres, Auth magic link, Realtime, pg_cron) · Vercel/Netlify.

## Comandos

```
supabase start                 # local
supabase db reset              # aplica migraciones + seed
supabase gen types typescript --local > web/src/types/db.ts
cd web && npm run dev
cd web && npm run build
psql "$DATABASE_URL" -f tests/rpc.sql    # pruebas de funciones
```

Proyecto en la nube: `ciudad-comun` (ref `ublcrfhnysqpegzmywwi`, sa-east-1). Sin CLI global ni psql: `npx supabase ...`. Los tests corren con `npx supabase db query --linked -f tests/rpc.sql` (o por el MCP de Supabase); asumen el seed sin jugadores y terminan en rollback, así que sirven antes de registrar gente o contra una base local recién reseteada. En local (Docker), el magic link llega a Mailpit: http://127.0.0.1:54324.

## Convenciones

- Español en UI, comentarios, docs, nombres de eventos y mensajes de error al usuario. Identificadores de código en inglés (`lot`, `player`, `construction`) salvo los términos del juego que no traducimos: `jornada`, `barrio`, `ladrillo`, `madera`, `energia`.
- Cada función SQL nueva: migración → `supabase gen types` → wrapper tipado en `web/src/api/actions.ts` → uso en el panel. En ese orden.
- Errores: las funciones lanzan `raise exception 'CODIGO'`. El cliente traduce en `web/src/api/errors.ts`. Nunca mostrar texto crudo de Postgres.
- Cada acción emite un evento en `events` con el `type` de la tabla de `docs/04-modelo-de-datos.md`. Si agregás un tipo nuevo, agregalo a esa tabla.
- Los jobs de cron son idempotentes. Probalos corriéndolos dos veces seguidas.
- Sin tests de UI. Sí tests SQL de cada RPC (caso feliz + cada código de error) en `tests/rpc.sql`.
- Commits chicos, un entregable por sesión. Mensaje en español, imperativo: "Agrega care_lot y su panel".

## Cómo probar a mano

Tres cuentas de email en el mismo navegador con perfiles distintos, o una normal y dos en incógnito. Para simular ausencia: `update players set last_seen_at = now() - interval '5 days' where display_name = 'X'; select job_update_lot_states();`. Para completar una construcción ya: `update constructions set ends_at = now() where id = '...'; select job_complete_constructions();`.

## Lo que el agente no decide solo

Cambiar un número de balance · agregar una tabla · tocar RLS · cambiar el orden del resumen · cualquier cosa de la lista "queda afuera". En esos casos: proponer, esperar confirmación.
