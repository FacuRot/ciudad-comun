// Qué dice un aviso en vivo (docs/07, "Avisos en vivo"). Solo los eventos que el jugador
// quiere que le interrumpan: el resto ya lo cuenta el resumen al volver.
import { BUILDING_LABEL, MATERIAL_LABEL } from './format';
import { t } from '../i18n';
import type { BuildingType, GameEvent, Material } from '../types/game';

type NameOf = (id: string | null) => string;

export function toastFor(event: GameEvent, nameOf: NameOf): string | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const who = nameOf(event.actor_id);
  switch (event.type) {
    case 'construction.completed':
      return t.toast.completed(BUILDING_LABEL[p.building_type as BuildingType].toLowerCase(), p.level);
    case 'construction.helped':
      return t.toast.helped(who);
    case 'gift.sent':
      return t.toast.gift(who, p.amount, MATERIAL_LABEL[p.material as Material]);
    case 'lot.cared':
      return t.toast.cared(who);
    default:
      return null;
  }
}

// Qué dice un aviso de notifications_outbox. En español, mismos textos que scripts/notify.ts:
// el panel de administración los muestra para copiarlos al WhatsApp.
export function noticeFor(type: string, payload: Record<string, unknown>): string {
  const p = payload ?? {};
  const building = (b: unknown) => BUILDING_LABEL[b as BuildingType]?.toLowerCase() ?? t.notice.building;
  switch (type) {
    case 'construction.completed':
      return t.notice.completed(building(p.building_type), p.level);
    case 'construction.helped':
      return t.notice.helped(p.helper);
    case 'gift.received':
      return t.notice.gift(p.from, p.amount, MATERIAL_LABEL[p.material as Material] ?? String(p.material));
    case 'lot.cared':
      return t.notice.cared(p.carer);
    case 'lot.neglected':
      return t.notice.neglected;
    case 'neighbor.new':
      return t.notice.neighbor(p.display_name);
    case 'public_work.completed':
      return t.notice.workDone(p.name);
    case 'barrio.opened':
      return t.notice.barrioOpened(p.name);
    default:
      return type;
  }
}
