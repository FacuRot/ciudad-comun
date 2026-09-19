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
