// Mago de Oz: lee notifications_outbox, manda un email por jugador y marca lo enviado.
// Corre cada 10 minutos (cron local o GitHub Actions). Ver docs/06-acciones-y-api.md.
//
//   npm run notify              envía
//   npm run notify -- --dry-run muestra qué mandaría, sin enviar ni marcar
//
// Variables (scripts/.env o el entorno): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY, NOTIFY_FROM, APP_URL.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

type Notification = {
  id: number;
  player_id: string;
  type: string;
  payload: Record<string, string | number>;
  created_at: string;
};

const MAX_LINES = 12; // un email no es un registro completo: lo demás se ve en el juego

// Los nombres del juego. Duplicados a propósito: este script no comparte código con web/.
const MATERIAL: Record<string, string> = { ladrillo: 'ladrillo', madera: 'madera', energia: 'energía' };
const BUILDING: Record<string, string> = {
  ladrilleria: 'ladrillería',
  aserradero: 'aserradero',
  generador: 'generador',
  plaza: 'plaza',
};

// Una línea por aviso. Si aparece un tipo nuevo sin plantilla, se saltea.
function lineOf(n: Notification): string | null {
  const p = n.payload ?? {};
  switch (n.type) {
    case 'construction.completed':
      return `Tu ${BUILDING[String(p.building_type)] ?? 'edificio'} está listo: nivel ${p.level}.`;
    case 'construction.helped':
      return `${p.helper} ayudó en tu construcción.`;
    case 'gift.received':
      return `${p.from} te regaló ${p.amount} de ${MATERIAL[String(p.material)] ?? p.material}.`;
    case 'lot.cared':
      return `${p.carer} cuidó tu lote mientras no estabas.`;
    case 'lot.neglected':
      return 'Hace unos días que no pasás: tu lote está descuidado y produce la mitad.';
    case 'neighbor.new':
      return `${p.display_name} fundó su lote al lado del tuyo.`;
    case 'public_work.completed':
      return `Se terminó la obra ${p.name}: todo el barrio produce más.`;
    case 'barrio.opened':
      return `Se abrió el ${p.name}: hay lotes nuevos para invitar gente.`;
    default:
      return null;
  }
}

function env(name: string, required = true): string {
  const value = process.env[name] ?? '';
  if (!value && required) {
    console.error(`Falta la variable ${name}. Ver el encabezado de scripts/notify.ts.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const appUrl = process.env.APP_URL ?? 'https://ciudad-comun.vercel.app';
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  // Cierra sobre sb para no tener que tipear el cliente a mano.
  const markSent = async (items: Notification[]) => {
    const { error } = await sb
      .from('notifications_outbox')
      .update({ sent_at: new Date().toISOString() })
      .in('id', items.map((n) => n.id));
    if (error) throw error;
  };

  const { data: pending, error } = await sb
    .from('notifications_outbox')
    .select('*')
    .is('sent_at', null)
    .order('created_at');
  if (error) throw error;
  if (!pending || pending.length === 0) {
    console.log('No hay avisos pendientes.');
    return;
  }

  // El email vive en auth.users, no en players.
  const { data: users, error: usersError } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const emails = new Map(users.users.map((u) => [u.id, u.email ?? '']));

  const { data: players } = await sb.from('players').select('id, display_name');
  const names = new Map((players ?? []).map((p) => [p.id, p.display_name]));

  const byPlayer = new Map<string, Notification[]>();
  for (const n of pending as Notification[]) {
    byPlayer.set(n.player_id, [...(byPlayer.get(n.player_id) ?? []), n]);
  }

  const resend = dryRun ? null : new Resend(env('RESEND_API_KEY'));
  const from = dryRun ? '' : env('NOTIFY_FROM');
  let sent = 0;
  let skipped = 0;

  for (const [playerId, items] of byPlayer) {
    const email = emails.get(playerId);
    if (!email) {
      console.warn(`Sin email para el jugador ${playerId}: quedan ${items.length} avisos pendientes.`);
      skipped += items.length;
      continue;
    }

    const lines = items.map(lineOf).filter((l): l is string => l !== null);
    if (lines.length === 0) {
      // Tipos sin plantilla: se marcan igual para que no se acumulen para siempre.
      if (!dryRun) await markSent(items);
      continue;
    }

    const shown = lines.slice(0, MAX_LINES);
    const rest = lines.length - shown.length;
    const subject = shown.length === 1 ? shown[0] : 'Pasaron cosas en Ciudad Común';
    const text = [
      `Hola ${names.get(playerId) ?? ''}`.trim() + ',',
      '',
      ...shown.map((l) => `· ${l}`),
      ...(rest > 0 ? [`· y ${rest} cosa${rest === 1 ? '' : 's'} más.`] : []),
      '',
      `Entrá a verlo: ${appUrl}`,
    ].join('\n');

    if (dryRun) {
      console.log(`\n--- ${email} · ${subject}\n${text}`);
      sent += items.length;
      continue;
    }

    const { error: sendError } = await resend!.emails.send({ from, to: email, subject, text });
    if (sendError) {
      // Sin marcar: la próxima corrida lo reintenta.
      console.error(`No se pudo enviar a ${email}:`, sendError.message);
      skipped += items.length;
      continue;
    }
    await markSent(items);
    sent += items.length;
  }

  console.log(`${dryRun ? 'Se mandarían' : 'Enviados'} ${sent} avisos a ${byPlayer.size} jugadores.`);
  if (skipped > 0) console.log(`${skipped} quedaron pendientes para la próxima corrida.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
