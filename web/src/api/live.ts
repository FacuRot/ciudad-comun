// Realtime sobre lots y constructions, con polling de respaldo (docs/06-acciones-y-api.md, "Lecturas"):
// si el canal no llega a SUBSCRIBED en 5 s o se cae, se repite la carga inicial cada 30 s.
import { sb } from './client';
import { refreshCity, refreshMe } from './sync';
import { useCity } from '../store/city';
import type { Construction, Lot } from '../types/game';

const SUBSCRIBE_TIMEOUT_MS = 5_000;
const POLL_MS = 30_000;
let seq = 0;

// Conecta y devuelve la función que corta todo.
export function connectCity(): () => void {
  let closed = false;
  let lost = false; // hubo un rato sin Realtime: al volver, se relee lo que se pudo perder
  let poll: ReturnType<typeof setInterval> | null = null;

  const resync = () => {
    refreshCity().catch(() => {});
  };
  const startPolling = () => {
    lost = true;
    if (poll === null) poll = setInterval(resync, POLL_MS);
  };
  const stopPolling = () => {
    if (poll !== null) clearInterval(poll);
    poll = null;
  };
  const timeout = setTimeout(startPolling, SUBSCRIBE_TIMEOUT_MS);

  const onLot = (lot: Lot) => {
    const s = useCity.getState();
    s.applyLot(lot);
    // Vecino nuevo: todavía no está en la lista de jugadores.
    if (lot.owner_id && !s.snapshot?.players.some((p) => p.id === lot.owner_id)) resync();
    // Mi lote cambió (por ejemplo, subió de nivel y el cierre recogió producción): releer el inventario.
    else if (lot.owner_id === s.me?.id) refreshMe().catch(() => {});
  };

  // Un tema por conexión: removeChannel filtra por tema, y en StrictMode el efecto se monta dos veces.
  const channel = sb
    .channel(`city-${++seq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, (payload) => {
      if (payload.eventType !== 'DELETE') onLot(payload.new as Lot);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' }, (payload) => {
      if (payload.eventType !== 'DELETE') useCity.getState().applyConstruction(payload.new as Construction);
    })
    .subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        stopPolling();
        if (lost) {
          lost = false;
          resync();
        }
      } else {
        // CHANNEL_ERROR, TIMED_OUT o CLOSED: supabase-js reintenta solo; mientras tanto, polling.
        startPolling();
      }
    });

  return () => {
    closed = true;
    clearTimeout(timeout);
    stopPolling();
    sb.removeChannel(channel);
  };
}
