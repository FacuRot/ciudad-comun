# 08 · Plan de construcción

Seis semanas de noches y fines de semana, seguidas de tres de prueba. Cada semana tiene un entregable que se puede probar a mano y un criterio de "listo". Si una semana se pasa, la siguiente se recorta, no se corre la fecha.

Estimación base: 10 a 12 horas por semana. Con Claude Code haciendo el grueso del código repetitivo, el cuello de botella es decidir, no tipear.

## Semana 0 · Antes de empezar (una tarde)

- Crear el repo con la estructura de `03-arquitectura-y-stack.md`. Copiar `CLAUDE.md` a la raíz y esta carpeta `docs/`.
- Crear el proyecto en Supabase. Activar `pg_cron`. Configurar el magic link (plantilla en español, URL de redirección a `/join`).
- Crear el proyecto en Vercel o Netlify apuntando a `web/`.
- Crear el grupo de WhatsApp de la cohorte (vacío por ahora).

**Listo cuando:** `supabase db push` corre sin errores y la app vacía deploya.

## Semana 1 · Base de datos y mapa que se ve

- Partir `schema.sql` en migraciones. Correr el seed. Generar tipos.
- Auth por magic link en el cliente. Pantalla `/join/:token` estados A y B (sin claim todavía).
- Renderer del canvas: grilla, calles, lotes libres, obras como celdas especiales, día/noche por hora. Carga inicial de `lots`, `barrios`, `public_works`.
- `claim_lot` funcionando de punta a punta, con la validación de distancia.

**Listo cuando:** dos personas con dos emails distintos pueden entrar por invitación, elegir lote y verse mutuamente en el mapa.

## Semana 2 · El loop personal

- Panel "Mi lote": nombre, color, selector de tipo, `build`.
- `job_complete_constructions` con pg_cron. Borde animado y reloj en el canvas.
- Producción perezosa: `heartbeat` al abrir y en `visibilitychange`; inventario en la barra superior.
- Realtime sobre `lots` y `constructions`, con fallback de polling.
- Recarga diaria de jornadas.

**Listo cuando:** construyo un nivel 1, a las 4 horas el lote sube de nivel solo, al volver tengo materiales nuevos, y otra persona lo ve cambiar sin refrescar.

## Semana 3 · El loop colectivo

- Panel de obra pública: barras, formulario de aporte, `contribute`, placa.
- Panel de lote ajeno: `visit_lot`, `help_construction`, `gift`.
- Decaimiento: `job_update_lot_states`, estados en el canvas, `care_lot`.
- Panel de barrio ("qué falta") con el cálculo de escasez.

**Listo cuando:** con tres cuentas, una aporta a la Escuela y las otras ven la barra moverse; una ayuda una construcción ajena y el reloj baja; forzando `last_seen_at` a hace 5 días un lote se ve descuidado y otra cuenta lo puede cuidar.

## Semana 4 · Volver

- `get_summary` y el modal "Mientras no estabas".
- Toasts por Realtime sobre `events` dirigidos al jugador.
- Modal de invitar con `create_invitation` y link de WhatsApp.
- `notifications_outbox` poblada por todas las funciones; `scripts/notify.ts` con Resend (o marcado manual desde admin si no da el tiempo).
- Apertura del Barrio 2: `job_check_barrio_opening`, evento, lotes que aparecen.

**Listo cuando:** cierro la pestaña, alguien me regala materiales y me ayuda, vuelvo 5 horas después y el modal me lo cuenta, y me llegó un email en el medio.

## Semana 5 · Panel de admin, pulido y prueba con bots

- `/admin` con stats, abrir barrio, outbox pendiente, invitaciones sin usar.
- Mensajes de error humanos para todos los códigos de `06-acciones-y-api.md`.
- Móvil: paneles abajo, canvas con zoom por pellizco o, si es más simple, tiles que se escalan al ancho.
- Script de bots: 30 jugadores falsos que hacen acciones al azar durante 3 días simulados, para ver que nada rompe y que los números de `05-reglas-y-parametros.md` §15 dan algo razonable. Los bots se borran antes de la cohorte.
- `scripts/metrics.sql` con las consultas de `09-experimento-y-metricas.md`, probadas contra los datos de los bots.

**Listo cuando:** el guion de primera sesión de `07-pantallas-y-flujos.md` se completa en un celular real sin que el equipo intervenga, y las consultas de métricas devuelven números.

## Semana 6 · Reserva y preparación de la cohorte

Esta semana existe para absorber lo que se atrasó. Si no se atrasó nada:

- Reset de la base (nuevo seed limpio). Registrar al equipo y marcar admins.
- Los 3 del equipo fundan sus lotes en distintas zonas del Barrio 1 para que los primeros invitados tengan vecinos.
- Preparar 60 invitaciones y el mensaje de invitación.
- Armar la hoja de seguimiento diario del experimento.
- Escribir las 3 plantillas de email de aviso.

**Listo cuando:** hay una fecha de arranque y una lista de 40 a 60 personas con su forma de contacto.

## Semanas 7 a 9 · Experimento

Ver `09-experimento-y-metricas.md`. Durante estas semanas **no se agregan funcionalidades**. Solo se arreglan bugs que impiden jugar y se ajustan parámetros en `cities.config` si algo está claramente roto en el balance (con registro de qué se cambió y cuándo).

## Qué recortar si el tiempo no alcanza (en este orden)

1. El script de email → marcado manual desde admin y avisos por WhatsApp.
2. Toasts en vivo → el modal de resumen alcanza.
3. Zoom en móvil → tiles escalados al ancho de pantalla.
4. Bots de prueba → prueba manual con 5 cuentas.
5. Panel de barrio → la frase "en tu barrio escasea X" en el panel de mi lote alcanza.

Lo que **no** se recorta: el claim con vecindad, construir, obras públicas con placa, ayudar, regalar, cuidar, el resumen al volver. Sin eso el experimento no mide lo que tiene que medir.

## Cómo trabajar con Claude Code en este repo

- Una sesión por entregable de la lista de arriba, no por semana. Empezar cada sesión pidiendo que lea `CLAUDE.md` y el documento relevante de `docs/`.
- Las funciones SQL se escriben y prueban primero con `supabase db reset` y un archivo `tests/*.sql` que llama cada RPC con casos felices y de error. Recién después el cliente.
- Cada RPC nueva pasa por: migración → tipos regenerados → wrapper en `api/` → panel que la usa.
- No dejar que el agente "mejore" el alcance. Si propone algo fuera de `02-alcance-prototipo.md`, anotarlo en `docs/despues.md` y seguir.
