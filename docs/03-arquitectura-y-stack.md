# 03 · Arquitectura y stack

Criterio rector: **lo más aburrido posible**. Cada pieza elegida es algo que no hay que aprender para el prototipo, que se reemplaza sin dolor si el juego crece, y que una sola persona puede operar.

## Stack

| Capa | Elección | Justificación |
|------|----------|---------------|
| Frontend | **Vite + React + TypeScript** | Rápido de levantar, ecosistema conocido, TypeScript comparte tipos con el contrato de la API. |
| Mapa | **Canvas 2D nativo** (sin motor) | El mapa son ~100 rectángulos de color. Un motor (Pixi, Phaser) agrega peso y conceptos sin beneficio a esta escala. Se abstrae en un módulo `renderer/` para reemplazarlo después si hace falta. |
| Estado cliente | **Zustand** | Un store chico: ciudad, mi jugador, panel abierto. Nada de Redux. |
| Backend | **Supabase** (Postgres + Auth + Realtime + pg_cron) | Resuelve auth por email y contraseña, tiempo real por cambios en tablas, y jobs programados sin escribir un servidor. Postgres es la única fuente de verdad. |
| Lógica de juego | **Funciones SQL/plpgsql** expuestas como RPC | El cliente nunca escribe tablas: llama funciones que validan y aplican. Anti-trampa gratis, y las reglas viven en un solo lugar. |
| Jobs | **pg_cron** dentro de Supabase | Recarga de jornadas, cierre de construcciones, evaluación de decaimiento, apertura del Barrio 2. |
| Email | **Resend** (o el SMTP de Supabase Auth) | Solo para recuperar la contraseña y, si da el tiempo, avisos de "terminó tu construcción". El SMTP integrado limita a ~2 mails por hora para todo el proyecto: si el reseteo lo va a usar más de una persona por vez, hace falta Resend. |
| Hosting frontend | **Vercel** o **Netlify** (estático) | Deploy por push. |
| Analítica | **Tabla `events` en Postgres** + consultas SQL | Las métricas del experimento salen de ahí. PostHog es opcional y se agrega solo si sobra tiempo. |
| Zona horaria del juego | `America/Argentina/Buenos_Aires` | Las jornadas se recargan a las 00:00 de esta zona. Se guarda en `cities.timezone` para no hardcodear. |

Todo es gratis o entra en el tier gratuito de cada servicio para 60 usuarios.

## Arquitectura

```
┌─────────────────────────────┐
│  Navegador (React + Canvas) │
│  - renderer/ (mapa)         │
│  - store/ (Zustand)         │
│  - api/ (supabase-js)       │
└──────┬───────────▲──────────┘
       │ RPC       │ Realtime (cambios en lots, constructions, public_works)
       ▼           │
┌──────────────────┴──────────┐
│  Supabase                   │
│  Auth (email + contraseña)  │
│  Postgres                   │
│   - tablas (estado)         │
│   - funciones RPC (reglas)  │
│   - tabla events (registro) │
│   - RLS: lectura pública    │
│     dentro de la ciudad,    │
│     escritura solo por RPC  │
│  pg_cron (ticks)            │
└─────────────────────────────┘
```

### Principios

1. **Servidor autoritativo.** Toda mutación del estado del juego es una llamada RPC (`rpc.build`, `rpc.help`, `rpc.contribute`, ...). Las funciones son `SECURITY DEFINER`, validan al jugador con `auth.uid()`, verifican jornadas y materiales, aplican el efecto en una transacción y emiten un evento. Las tablas del juego no tienen políticas de INSERT/UPDATE para el rol `authenticated`.

2. **Lectura abierta dentro de la ciudad.** Cualquier jugador autenticado lee todo el estado de su ciudad (lotes, construcciones, obras, contribuyentes). No hay información oculta: el juego es el espectáculo de lo que hacen los demás.

3. **Producción perezosa.** Los materiales no se acumulan con un job cada minuto: cada lote guarda `production_collected_at` y al entrar el jugador (o al hacer cualquier acción) se calcula lo producido desde entonces, con un tope de 48 horas de acumulación. Un solo job diario alcanza para lo demás.

4. **Eventos como registro.** Cada acción escribe una fila en `events` (quién, qué, sobre qué, cuándo, payload). De ahí salen: el resumen "mientras no estabas", la placa de contribuyentes, las visitas, y todas las métricas del experimento.

5. **Tiempo real, pero sin depender de él.** El cliente se suscribe a cambios de `lots`, `constructions` y `public_works` vía Supabase Realtime. Si la suscripción falla, un polling cada 30 segundos mantiene la vista correcta. Con 60 jugadores cualquiera de los dos alcanza.

6. **Configuración en tabla.** Los parámetros de balance (costos, tiempos, tasas) viven en `game_config` (JSONB por ciudad) y se leen desde las funciones. Cambiar un número no requiere deploy.

## Estructura del repositorio

```
ciudad-comun/
├── CLAUDE.md
├── docs/                    ← esta carpeta
├── supabase/
│   ├── migrations/          ← schema.sql partido en migraciones
│   ├── seed.sql             ← ciudad, barrios, lotes, config, obras
│   └── functions/           ← edge functions (solo si hace falta email)
├── web/
│   ├── src/
│   │   ├── api/             ← wrappers tipados de cada RPC
│   │   ├── store/           ← Zustand
│   │   ├── renderer/        ← canvas: tiles, colores, día/noche
│   │   ├── screens/         ← Join, City, Admin
│   │   ├── panels/          ← LotPanel, MyLotPanel, PublicWorkPanel, SummaryModal
│   │   └── types/           ← generados con `supabase gen types`
│   └── index.html
└── scripts/
    ├── notify.ts            ← envía avisos pendientes por email (Mago de Oz)
    ├── bots.sql             ← 30 jugadores falsos, 3 días simulados
    ├── bots_cleanup.sql     ← los borra y deja la ciudad como el seed
    └── metrics.sql          ← consultas del experimento
```

## Decisiones técnicas que conviene no revisar durante el prototipo

- **No** usar un motor de juego. **No** usar WebSockets propios. **No** usar un backend en Node aparte de Supabase. **No** hacer app móvil. **No** optimizar el renderer más allá de "redibujar todo el canvas cuando cambia algo" (100 tiles se redibujan en menos de un milisegundo).
- Si algo de esto parece necesario, primero revisar `02-alcance-prototipo.md`.

## Seguridad mínima suficiente

- Auth por email y contraseña, sin confirmación de email: quien recibe una invitación se registra y entra en el momento. El correo solo se usa para recuperar la contraseña.
- Cualquiera puede crear una cuenta, pero sin una invitación redimida queda inerte: no hay fila en `players`, y `my_city_id()` es `null`, así que RLS le filtra todo.
- RLS activo en todas las tablas: lectura para autenticados dentro de su ciudad; escritura cerrada.
- Las funciones RPC validan siempre `auth.uid()`; nunca reciben `player_id` por parámetro.
- Los tokens de invitación son de un solo uso y expiran en 7 días.
- El panel de administración se protege con una columna `players.is_admin` verificada en las funciones de admin.

## Qué se reemplaza si el juego crece

| Pieza | Límite estimado | Reemplazo |
|-------|-----------------|-----------|
| Canvas con redibujo total | ~2.000 tiles | Redibujo parcial o Pixi.js |
| Realtime de Supabase | Miles de conexiones simultáneas | Servidor de WebSockets propio |
| Producción perezosa | Fórmulas más complejas (adyacencias dinámicas) | Job de tick por ciudad |
| Funciones plpgsql | Lógica muy ramificada | Servicio de reglas en TypeScript con la misma interfaz RPC |

Ninguno de estos límites se toca en el experimento.
