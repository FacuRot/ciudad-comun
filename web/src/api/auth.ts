import { sb } from './client';

// Manda el magic link. Al tocarlo, la persona vuelve a la misma URL de invitación ya con sesión.
export async function sendMagicLink(email: string, redirectTo: string): Promise<boolean> {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return !error;
}
