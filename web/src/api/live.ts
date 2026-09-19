// Realtime sobre lots, constructions, public_works y barrios, con polling de respaldo
// (docs/06-acciones-y-api.md, "Lecturas"):
// si el canal no llega a SUBSCRIBED en 5 s o se cae, se repite la carga inicial cada 30 s.
import { sb } from './client';
import { refreshCity, refreshMe } from './sync';
import { useCity } from '../store/city';
import { toastFor } from '../game/events';
import type { Barrio, Construction, GameEvent, Lot, PublicWork } from '../types/game';

const SUBSCRIBE_TIMEOUT_MS = 5_000;
const POLL_MS = 30_000;
let seq = 0;

// Conecta y devuelve la función que corta todo.
export function connectCity(): () => void {
  const uid = useCity.getState().session?.user.id ?? '';
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

  const nameOf = (id: string | null) =>
    useCity.getState().snapshot?.players.find((p) => p.id === id)?.display_name ?? 'Alguien';

  // La obra terminada y el barrio abierto no son eventos dirigidos a nadie: se avisan
  // mirando la fila que cambió, que ya llega por su canal.
  const onWork = (work: PublicWork) => {
    const before = useCity.getState().snapshot?.works.find((w) => w.id === work.id);
    useCity.getState().applyWork(work);
    if (before && before.status !== 'completada' && work.status === 'completada') {
      useCity.getState().pushToast(`Se terminó la obra ${work.name}.`);
    }
  };

  const onBarrio = (barrio: Barrio) => {
    const before = useCity.getState().snapshot?.barrios.find((b) => b.id === barrio.id);
    useCity.getState().applyBarrio(barrio);
    if (before && before.status === 'cerrado' && barrio.status === 'abierto') {
      useCity.getState().pushToast(`Se abrió el ${barrio.name}: hay lotes nuevos.`);
    }
  };

  const onLot = (lot: Lot) => {
    const s = useCity.getState();
    s.applyLot(lot);
    // Vecino nuevo: todavía no está en la lista de jugadores.
    if (lot.owner_id && !s.snapshot?.players.some((p) => p.id === lot.owner_id)) resync();
    // Mi lote cambió (por ejemplo, subió de nivel y el cierre recogió producción): releer el inventario.
    else if (lot.owner_id === s.me?.id) refreshMe().catch(() => {});
  };

  // Un tema por conexión: removeChannel filtra por tema, y en StrictMode el efecto se monta dos veces.
  let channel = sb
    .channel(`city-${++seq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, (payload) => {
      if (payload.eventType !== 'DELETE') onLot(payload.new as Lot);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' }, (payload) => {
      if (payload.eventType !== 'DELETE') useCity.getState().applyConstruction(payload.new as Construction);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'public_works' }, (payload) => {
      if (payload.eventType !== 'DELETE') onWork(payload.new as PublicWork);
    })
    // Apertura del barrio: sus lotes llegan por el canal de lots; acá solo cambia el estado del barrio.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'barrios' }, (payload) => {
      if (payload.eventType !== 'DELETE') onBarrio(payload.new as Barrio);
    });

  // Avisos en vivo: solo los eventos dirigidos a este jugador (docs/06, "Lecturas").
  // Sin uid el filtro quedaría inválido y tiraría abajo todo el canal, así que no se agrega.
  if (uid) {
    channel = channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events', filter: `target_player_id=eq.${uid}` },
      (payload) => {
        const text = toastFor(payload.new as GameEvent, nameOf);
        if (text) useCity.getState().pushToast(text);
      },
    );
  }

  channel.subscribe((status) => {
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
