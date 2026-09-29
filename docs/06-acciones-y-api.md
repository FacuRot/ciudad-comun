# 06 · Acciones y API

Toda acción del jugador es una llamada `supabase.rpc('<función>', {...})`. Las lecturas van directo a las tablas con `supabase.from(...)` bajo RLS. Este documento es el contrato entre cliente y servidor; la implementación está en `supabase/migrations/`.

## Convenciones

- Las funciones nunca reciben el id del jugador: lo toman de `auth.uid()`.
- Antes de cualquier acción que gaste recursos, la función recoge la producción pendiente del jugador (`fx_collect_production`), así el saldo de materiales está al día.
- Los errores se lanzan con `raise exception 'CODIGO'`. El cliente mapea el código a un mensaje. Nunca se muestra el texto crudo de Postgres.
- Toda función que muta escribe al menos un evento en `events`.

## Códigos de error

| Código | Significado | Mensaje sugerido |
|--------|-------------|------------------|
| `NO_AUTH` | Sin sesión | "Entrá con tu email y contraseña para seguir." |
| `NO_PLAYER` | Usuario autenticado sin jugador | Redirigir a la pantalla de entrada. |
| `ALREADY_PLAYER` | Ya tiene lote | Redirigir a la ciudad. |
| `BAD_INVITE` | Token inválido, usado o vencido | "Esta invitación ya no sirve. Pedile otra a quien te invitó." |
| `LOT_NOT_FREE` | El lote ya no está libre | "Alguien se adelantó. Elegí otro lote." |
| `LOT_ISOLATED` | Lote lejos de vecinos activos | "Elegí un lote más cerca de tus vecinos." |
| `BAD_COLOR` | Color fuera de paleta | (no debería ocurrir desde la UI) |
| `NO_JORNADAS` | Sin jornadas | "Te quedaste sin jornadas por hoy. Mañana tenés 3 más." |
| `NO_MATERIALS` | Materiales insuficientes | "Te faltan materiales. Pediles a tus vecinos." |
| `NO_LOT` | El jugador no tiene lote | Redirigir a entrada. |
| `ALREADY_BUILDING` | Construcción en curso | "Tu lote ya está en obra." |
| `MAX_LEVEL` | Nivel 3 alcanzado | "Tu edificio ya está al máximo." |
| `TYPE_LOCKED` | Intento de cambiar tipo | "El tipo de edificio no se cambia." |
| `NO_CONSTRUCTION` | Construcción inexistente o terminada | "Esa obra ya terminó." |
| `OWN_CONSTRUCTION` / `OWN_LOT` / `SELF_GIFT` | Acción sobre uno mismo | "Esto es para ayudar a otros." |
| `OTHER_CITY` | Objeto de otra ciudad | (no debería ocurrir) |
| `NO_WORK` | Obra pública inexistente o completada | "Esa obra ya está terminada." |
| `LOT_NOT_NEGLECTED` | Cuidar un lote activo | "Este lote está bien cuidado." |
| `CARE_LIMIT` | Máximo de cuidados | "Este lote ya recibió todos los cuidados posibles." |
| `GIFT_TOO_SMALL` | Menos del mínimo | "El regalo mínimo es de 5 unidades." |
| `RENT_MATERIAL` | Residencial sin material de alquiler, o material en otro tipo o distinto del que ya tiene | "Elegí qué material vas a cobrar de alquiler." |
| `STREETS_FULL` | Mantener calles que ya están en 100 (o de un barrio cerrado) | "Las calles ya están al día." |
| `STREETS_DONE_TODAY` | Ya mantuvo las calles de ese barrio hoy | "Hoy ya mantuviste estas calles. Mañana podés de nuevo." |
| `NOT_ADMIN` | Sin permisos | — |
| violación de PK en `construction_helps` | Ya ayudó esa construcción | "Ya ayudaste en esta obra." |

El cliente (`web/src/api/errors.ts`) agrega tres códigos que ninguna función lanza: `OFFLINE` ("Se cortó la conexión. Probá de nuevo cuando vuelva.") cuando el pedido no llega, `UNKNOWN` para cualquier otra cosa, y los nombres de restricción de la base (`ALREADY_HELPED`, `LOT_NAME_TAKEN`, `DISPLAY_NAME_TAKEN`, `NAME_LENGTH`). Un 401 de PostgREST (`PGRST301` y compañía) se traduce a `NO_AUTH`: la sesión venció.

### Errores de entrada (registro, login y contraseña)

No pasan por PostgREST: son los de supabase-auth, y `authCodeOf` traduce su `code` a los nuestros.

| Código supabase | Nuestro código | Mensaje |
|---|---|---|
| `invalid_credentials` | `BAD_CREDENTIALS` | "Email o contraseña incorrectos." |
| `user_already_exists`, `email_exists` | `EMAIL_TAKEN` | "Ese email ya tiene cuenta. Entrá con tu contraseña." |
| `weak_password` | `WEAK_PASSWORD` | "La contraseña necesita al menos 8 caracteres." |
| `validation_failed`, `email_address_invalid` | `BAD_EMAIL` | "Revisá el email: parece que tiene un error." |
| `over_request_rate_limit`, `over_email_send_rate_limit` | `TOO_MANY` | "Probaste muchas veces. Esperá un minuto." |
| `same_password` | `SAME_PASSWORD` | "Elegí una contraseña distinta a la anterior." |
| `session_not_found`, `session_expired`, o `/clave` sin sesión | `BAD_RECOVERY` | "Este link de contraseña ya venció. Pedí uno nuevo." |
| (signUp sin sesión: el proyecto tiene las confirmaciones encendidas) | `CONFIRM_EMAIL` | "Te mandamos un email para confirmar la cuenta. Abrilo y volvé a este link." |

Las cuatro funciones que los lanzan viven en `web/src/api/auth.ts`: `registrar`, `entrar`, `pedirClaveNueva` y `cambiarClave`. Ninguna toca la base del juego: el usuario queda en `auth.users` y recién `claim_lot` lo convierte en jugador.

## Acciones

### `invitation_info(p_token)` → jsonb
Disponible para `anon`. Devuelve `{valid, city_id, inviter, lot_hint}`. Se usa en la pantalla de entrada antes de que la persona se registre.

### `invitation_map(p_token)` → jsonb
Disponible para `anon`. Solo lectura. Si el token es válido (existe, sin usar y sin vencer) devuelve el mapa de su ciudad: `{timezone, palette, max_claim_distance, lots, barrios, works}`; si no, `null`. Los lotes vienen sin dueño ni apodo (posición, estado, nombre, color, tipo y nivel). Es lo que pinta la pantalla de entrada en los estados A y B, cuando la persona todavía no es jugador y el RLS no le deja leer las tablas. Se eligió una función por token en lugar de políticas de lectura para `anon`: el mapa solo lo ve quien tiene un link vigente.

### `claim_lot(p_token, p_display_name, p_lot_id, p_lot_name, p_color)` → lots
Registro completo en una transacción: valida invitación, crea `players` e `inventories` con el kit inicial, toma el lote, marca la invitación como usada, emite `player.joined` y `lot.claimed`, y encola avisos `neighbor.new` para los vecinos a distancia ≤ 2.
Precondiciones: usuario autenticado sin jugador; lote `libre` y a distancia ≤ 2 de un lote ocupado no abandonado (salvo ciudad vacía).

### `heartbeat()` → jsonb
Se llama al abrir la app y cada vez que la pestaña vuelve a estar visible (`visibilitychange`). Recoge producción, actualiza `last_seen_at`, reactiva el lote si estaba descuidado o abandonado, y devuelve `{hours_away, since, collected, show_summary}`. `collected` es `{material, amount}`, más `attractiveness` si lo recogido es el alquiler de un residencial (el resumen dice "rindió al 86 %" con ese número). Si `show_summary` es true, el cliente llama a `get_summary(since)`.

### `get_summary(p_since)` → events[]
Eventos relevantes para el jugador desde `p_since`: los dirigidos a él, los de obras públicas y barrio, los `barrio.population_changed` de su barrio y los vecinos nuevos a distancia ≤ 2. El cliente los agrupa según el orden de prioridad de `05-reglas-y-parametros.md` §11.

### `build(p_building_type, p_rent_material default null)` → constructions
Nivel 1: elige el tipo. Niveles 2 y 3: el tipo debe coincidir. Gasta 1 jornada y los materiales del nivel objetivo; crea la construcción con `ends_at`. Emite `construction.started`.

`p_rent_material` es el material del alquiler (`05` §17.1). Obligatorio en el nivel 1 de un residencial, y se guarda en `lots.rent_material` en el acto. En las mejoras de un residencial puede venir vacío o igual al que tiene; en cualquier otro tipo tiene que venir vacío. Si no, `RENT_MATERIAL`.

### `maintain_streets(p_barrio_id)` → barrios
Mantener las calles de un barrio abierto, propio o ajeno (`05` §18). Calcula el estado de ahora con el desgaste perezoso; si redondeado ya es 100, `STREETS_FULL`. Si el jugador ya mantuvo ese barrio hoy (día del juego, contado en los eventos), `STREETS_DONE_TODAY`. Gasta 1 jornada y `streets.cost`, suma `streets.points` con tope de 100, guarda el estado y reinicia el reloj (`streets_updated_at = now()`). Emite `streets.maintained`. Un barrio inexistente o de otra ciudad es `OTHER_CITY`.

### `help_construction(p_construction_id)` → constructions
Gasta 1 jornada, registra la ayuda (una por jugador por construcción), resta `help.hours_reduced` a `ends_at`. Si queda en el pasado, completa la construcción en el acto. Emite `construction.helped` y encola aviso al dueño.

### `contribute(p_public_work_id, p_l, p_m, p_e)` → public_works
Gasta 1 jornada y los materiales indicados (recortados a lo que falta). Suma al progreso. Si se completa: `status = completada`, evento `public_work.completed`, aviso a toda la ciudad. Emite `public_work.contributed`.

### `care_lot(p_lot_id)` → lots
Solo sobre lotes ajenos en estado `descuidado` o `abandonado` y con menos de `care.max_per_absence` cuidados. Gasta 1 jornada, suma `care.days_added` a `care_days`, recalcula el estado. Emite `lot.cared`, encola aviso al dueño.

### `gift(p_to_player, p_material, p_amount)` → void
Sin jornada. Mueve materiales entre inventarios en la misma transacción. Emite `gift.sent`, encola aviso al receptor.

### `visit_lot(p_lot_id)` → void
Se llama al abrir el panel de un lote ajeno. Inserta en `lot_visits` con `on conflict do nothing`; solo emite `lot.visited` si fue la primera visita del día.

### `rename_lot(p_name)` / `recolor_lot(p_color)` → void
Sin costo. Emiten sus eventos.

### `create_invitation()` → text
Devuelve un token nuevo con `lot_hint` = lote del invitador. El cliente arma la URL `/join/<token>`.

### Administración
Todas requieren `players.is_admin` y son lo que consume `/admin` (`07-pantallas-y-flujos.md` §3).

- `admin_city_stats()` → jsonb con el estado de la ciudad.
- `admin_force_open_barrio(p_barrio_id)` → abre el barrio siguiente a mano.
- `admin_pending_notifications(p_limit)` → jsonb[] de `notifications_outbox` sin enviar, con el apodo del destinatario. La tabla no es legible bajo RLS ni para el admin: se lee por función.
- `admin_mark_notified(p_ids)` → marca esos avisos como enviados y devuelve cuántos marcó. Es el modo manual del Mago de Oz. No emite evento: no cambia el estado del juego, solo el registro de envíos.
- `admin_invitations()` → jsonb[] de invitaciones sin usar, con invitador, lote sugerido y si ya venció.

## Lecturas

El cliente carga el estado completo de la ciudad al entrar y lo mantiene con Realtime:

```ts
// Carga inicial
const [{ data: lots }, { data: constructions }, { data: works }, { data: barrios }, { data: players }] = await Promise.all([
  sb.from('lots').select('*'),
  sb.from('constructions').select('*').is('completed_at', null),
  sb.from('public_works').select('*'),
  sb.from('barrios').select('*'),
  sb.from('players').select('id, display_name, last_seen_at'),
]);
const { data: me } = await sb.from('players').select('*').eq('id', uid).single();
const { data: inv } = await sb.from('inventories').select('*').eq('player_id', uid).single();

// Placa de una obra
sb.from('public_work_contributions').select('player_id, players(display_name)').eq('public_work_id', id);

// Quién pasó por un lote: lot_visits no tiene política de lectura, así que el cliente
// lee los eventos lot.visited, que sí son legibles dentro de la ciudad.
sb.from('events').select('actor_id, created_at').eq('type', 'lot.visited').eq('lot_id', id);

// Quién mantuvo las calles de un barrio en los últimos 7 días.
sb.from('events').select('actor_id, created_at').eq('type', 'streets.maintained')
  .eq('payload->>barrio_id', id).gte('created_at', hace7dias);

// Realtime
sb.channel('city')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, applyLot)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' }, applyConstruction)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'public_works' }, applyWork)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'barrios' }, applyBarrio)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `target_player_id=eq.${uid}` }, toast)
  .subscribe();
```

Fallback: si el canal no llega a `SUBSCRIBED` en 5 segundos o se cae, `setInterval` de 30 segundos que repite la carga inicial.

El toast de `events` solo puede filtrar por `target_player_id`, así que la obra completada y el barrio abierto —que no apuntan a nadie— se avisan mirando la fila que cambió en `public_works` y `barrios`, que ya llega por su propio canal. Por ese mismo canal de `barrios` llegan la población del día y el estado de calles guardado; el desgaste de ahí en adelante lo calcula el cliente con la misma cuenta que `fx_streets_state`.

## Wrappers tipados en el cliente

Un archivo `web/src/api/actions.ts` con una función por RPC, que traduce el código de error a un mensaje y actualiza el store con la fila devuelta:

```ts
export async function build(type: BuildingType, rentMaterial?: Material) {
  const { data, error } = await sb.rpc('build', { p_building_type: type, p_rent_material: rentMaterial });
  if (error) throw new GameError(codeOf(error));
  store.getState().applyConstruction(data);
  return data;
}
```

Los tipos se generan con `supabase gen types typescript --local > web/src/types/db.ts` después de cada migración.

## Script de notificaciones (Mago de Oz)

`scripts/notify.ts` corre cada 10 minutos (cron local o GitHub Actions):

1. `select * from notifications_outbox where sent_at is null order by created_at` con `service_role`.
2. Agrupa por jugador y tipo. Envía un solo email por jugador con todo lo pendiente. Plantillas en español, una línea por aviso: "Tu ladrillería nivel 2 está lista", "Marta te regaló 20 de madera", "Se abrió el Barrio del Río".
3. Marca `sent_at = now()`.

Si el script no está listo el día 1, el admin lee la tabla desde el panel y avisa por WhatsApp. El sistema no depende del envío.
