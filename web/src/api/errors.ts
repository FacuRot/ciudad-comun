// Traduce los códigos que lanzan las funciones (docs/06-acciones-y-api.md) a mensajes.
// Nunca se muestra el texto crudo de Postgres. Además de los del contrato hay códigos de la
// entrada con contraseña (authCodeOf), derivados de restricciones de la base (codeOf) y
// propios del cliente (OFFLINE, UNKNOWN).
import { t } from '../i18n';

// Los textos de cada código, en el idioma del navegador, viven en i18n (errors).
const MESSAGES = t.errors;

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
