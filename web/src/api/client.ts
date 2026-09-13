import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/db';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en web/.env.local');
}

// Flujo implícito: el magic link funciona aunque el email se abra en otro navegador del celular.
export const sb = createClient<Database>(url, key, { auth: { flowType: 'implicit' } });
