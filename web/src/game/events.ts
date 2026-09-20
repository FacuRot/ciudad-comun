// Qué dice un aviso en vivo (docs/07, "Avisos en vivo"). Solo los eventos que el jugador
// quiere que le interrumpan: el resto ya lo cuenta el resumen al volver.
import { BUILDING_LABEL, MATERIAL_LABEL } from './format';
import type { BuildingType, GameEvent, Material } from '../types/game';

type NameOf = (id: string | null) => string;

export function toastFor(event: GameEvent, nameOf: NameOf): string | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const who = nameOf(event.actor_id);
  switch (event.type) {
    case 'construction.completed':
      return `Tu ${BUILDING_LABEL[p.building_type as BuildingType].toLowerCase()} subió a nivel ${p.level}.`;
    case 'construction.helped':
      return `${who} ayudó en tu construcción.`;
    case 'gift.sent':
      return `${who} te regaló ${p.amount} de ${MATERIAL_LABEL[p.material as Material]}.`;
    case 'lot.cared':
      return `${who} cuidó tu lote.`;
    default:
      return null;
  }
}

// Qué dice un aviso de notifications_outbox. Mismos textos que scripts/notify.ts:
// el panel de administración los muestra para copiarlos al WhatsApp.
export function noticeFor(type: string, payload: Record<string, unknown>): string {
  const p = payload ?? {};
  const building = (b: unknown) => BUILDING_LABEL[b as BuildingType]?.toLowerCase() ?? 'edificio';
  switch (type) {
    case 'construction.completed':
      return `Su ${building(p.building_type)} está listo: nivel ${p.level}.`;
    case 'construction.helped':
      return `${p.helper} ayudó en su construcción.`;
    case 'gift.received':
      return `${p.from} le regaló ${p.amount} de ${MATERIAL_LABEL[p.material as Material] ?? p.material}.`;
    case 'lot.cared':
      return `${p.carer} cuidó su lote mientras no estaba.`;
    case 'lot.neglected':
      return 'Hace días que no pasa: su lote está descuidado y produce la mitad.';
    case 'neighbor.new':
      return `${p.display_name} fundó su lote al lado del suyo.`;
    case 'public_work.completed':
      return `Se terminó la obra ${p.name}: todo el barrio produce más.`;
    case 'barrio.opened':
      return `Se abrió el ${p.name}: hay lotes nuevos para invitar gente.`;
    default:
      return type;
  }
}
