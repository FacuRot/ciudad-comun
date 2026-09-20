// Registro y entrada con email y contraseña (docs/07-pantallas-y-flujos.md §1 y §4).
// El email solo vuelve a aparecer para recuperar la contraseña.
import type { AuthError } from '@supabase/supabase-js';
import { sb } from './client';
import { authCodeOf, GameError } from './errors';

function check(error: AuthError | null): void {
  if (error) throw new GameError(authCodeOf(error));
}

// Con las confirmaciones apagadas, signUp deja la sesión lista y no manda ningún email.
export async function registrar(email: string, password: string): Promise<void> {
  const { data, error } = await sb.auth.signUp({ email, password });
  check(error);
  // Si alguna vez se encienden las confirmaciones, un email ya registrado no da error:
  // vuelve un usuario sin identidades para no delatar quién tiene cuenta.
  if (data.user && data.user.identities?.length === 0) throw new GameError('EMAIL_TAKEN');
  // Sin sesión es que el proyecto tiene las confirmaciones encendidas (no debería).
  if (!data.session) throw new GameError('CONFIRM_EMAIL');
}

export async function entrar(email: string, password: string): Promise<void> {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  check(error);
}

// Manda el link de recuperación. Al tocarlo, la persona cae en /clave ya con sesión.
export async function pedirClaveNueva(email: string): Promise<void> {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/clave`,
  });
  check(error);
}

export async function cambiarClave(password: string): Promise<void> {
  const { error } = await sb.auth.updateUser({ password });
  check(error);
}
