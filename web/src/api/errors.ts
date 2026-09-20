// Traduce los códigos que lanzan las funciones (docs/06-acciones-y-api.md) a mensajes.
// Nunca se muestra el texto crudo de Postgres.

const MESSAGES: Record<string, string> = {
  NO_AUTH: 'Entrá con tu email y contraseña para seguir.',
  NO_PLAYER: 'Todavía no tenés lote. Entrá con el link de tu invitación.',
  ALREADY_PLAYER: 'Ya tenés un lote en la ciudad.',
  BAD_INVITE: 'Esta invitación ya no sirve. Pedile otra a quien te invitó.',
  LOT_NOT_FREE: 'Alguien se adelantó. Elegí otro lote.',
  LOT_ISOLATED: 'Elegí un lote más cerca de tus vecinos.',
  BAD_COLOR: 'Elegí uno de los colores de la paleta.',
  NO_JORNADAS: 'Te quedaste sin jornadas por hoy. Mañana tenés 3 más.',
  NO_MATERIALS: 'Te faltan materiales. Pediles a tus vecinos.',
  NO_LOT: 'Ese lote no está disponible.',
  ALREADY_BUILDING: 'Tu lote ya está en obra.',
  MAX_LEVEL: 'Tu edificio ya está al máximo.',
  TYPE_LOCKED: 'El tipo de edificio no se cambia.',
  NO_CONSTRUCTION: 'Esa obra ya terminó.',
  OWN_CONSTRUCTION: 'Esto es para ayudar a otros.',
  OWN_LOT: 'Esto es para ayudar a otros.',
  SELF_GIFT: 'Esto es para ayudar a otros.',
  OTHER_CITY: 'Eso es de otra ciudad.',
  NO_WORK: 'Esa obra ya está terminada.',
  LOT_NOT_NEGLECTED: 'Este lote está bien cuidado.',
  CARE_LIMIT: 'Este lote ya recibió todos los cuidados posibles.',
  GIFT_TOO_SMALL: 'El regalo mínimo es de 5 unidades.',
  BAD_AMOUNT: 'Las cantidades no pueden ser negativas.',
  NOT_ADMIN: 'Esto es solo para el equipo.',
  // De la entrada con contraseña (ver authCodeOf).
  BAD_CREDENTIALS: 'Email o contraseña incorrectos.',
  EMAIL_TAKEN: 'Ese email ya tiene cuenta. Entrá con tu contraseña.',
  WEAK_PASSWORD: 'La contraseña necesita al menos 8 caracteres.',
  BAD_EMAIL: 'Revisá el email: parece que tiene un error.',
  TOO_MANY: 'Probaste muchas veces. Esperá un minuto.',
  SAME_PASSWORD: 'Elegí una contraseña distinta a la anterior.',
  BAD_RECOVERY: 'Este link de contraseña ya venció. Pedí uno nuevo.',
  CONFIRM_EMAIL: 'Te mandamos un email para confirmar la cuenta. Abrilo y volvé a este link.',
  // Derivados de restricciones de la base (ver codeOf).
  ALREADY_HELPED: 'Ya ayudaste en esta obra.',
  LOT_NAME_TAKEN: 'Ese nombre ya lo usa otro lote.',
  DISPLAY_NAME_TAKEN: 'Ese apodo ya lo usa otra persona.',
  NAME_LENGTH: 'Tiene que tener entre 2 y 24 caracteres.',
  // Propios del cliente: no los lanza ninguna función.
  OFFLINE: 'Se cortó la conexión. Probá de nuevo cuando vuelva.',
  UNKNOWN: 'Algo salió mal. Probá de nuevo en un rato.',
};

// Violaciones de restricciones que el contrato no convierte en código propio.
const CONSTRAINTS: Record<string, string> = {
  construction_helps_pkey: 'ALREADY_HELPED',
  lots_city_id_name_key: 'LOT_NAME_TAKEN',
  players_city_id_display_name_key: 'DISPLAY_NAME_TAKEN',
  lots_name_check: 'NAME_LENGTH',
  players_display_name_check: 'NAME_LENGTH',
};

export class GameError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? MESSAGES.UNKNOWN);
    this.name = 'GameError';
  }
}

type PgError = { message?: string; code?: string };

// Los errores de supabase-auth no pasan por PostgREST: traen su propio código.
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'BAD_CREDENTIALS',
  user_already_exists: 'EMAIL_TAKEN',
  email_exists: 'EMAIL_TAKEN',
  weak_password: 'WEAK_PASSWORD',
  validation_failed: 'BAD_EMAIL',
  email_address_invalid: 'BAD_EMAIL',
  over_request_rate_limit: 'TOO_MANY',
  over_email_send_rate_limit: 'TOO_MANY',
  same_password: 'SAME_PASSWORD',
  session_not_found: 'BAD_RECOVERY',
  session_expired: 'BAD_RECOVERY',
};

export function authCodeOf(error: { code?: string; message?: string; status?: number }): string {
  if (error.code && error.code in AUTH_ERRORS) return AUTH_ERRORS[error.code];
  const message = error.message ?? '';
  if (/failed to fetch|networkerror|network request failed/i.test(message)) return 'OFFLINE';
  // Versiones viejas de supabase-js no mandan `code`: queda el status.
  if (error.status === 400 || error.status === 401) return 'BAD_CREDENTIALS';
  if (error.status === 422) return 'EMAIL_TAKEN';
  if (error.status === 429) return 'TOO_MANY';
  return 'UNKNOWN';
}

// La sesión venció o el token no sirve: PostgREST responde 401 con estos códigos.
const AUTH_CODES = ['PGRST301', 'PGRST302', 'PGRST303'];

export function codeOf(error: PgError): string {
  const message = error.message ?? '';
  if (message in MESSAGES) return message;
  for (const [constraint, code] of Object.entries(CONSTRAINTS)) {
    if (message.includes(`"${constraint}"`)) return code;
  }
  if (error.code && AUTH_CODES.includes(error.code)) return 'NO_AUTH';
  if (/\bjwt\b/i.test(message)) return 'NO_AUTH';
  // supabase-js devuelve el error de fetch tal cual cuando no hay red.
  if (/failed to fetch|networkerror|network request failed/i.test(message)) return 'OFFLINE';
  return 'UNKNOWN';
}

export function messageOf(e: unknown): string {
  return e instanceof GameError ? e.message : MESSAGES.UNKNOWN;
}
