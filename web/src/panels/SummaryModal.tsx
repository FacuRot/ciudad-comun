// Modal "Mientras no estabas" (docs/07-pantallas-y-flujos.md).
// El orden de las líneas es el de docs/05-reglas-y-parametros.md §11; se arma con los
// eventos de get_summary, que no se guardan en ningún lado.
import { useState, type ReactNode } from 'react';
import { useCity } from '../store/city';
import { workAmounts, workPercent } from '../game/geo';
import { BUILDING_LABEL, MATERIAL_LABEL, plural } from '../game/format';
import type { BuildingType, GameEvent, Material, PublicWork, WorkAmounts } from '../types/game';

const MAX_LINES = 8;

export type Collected = { material?: Material; amount?: number };

export function SummaryModal({
  events,
  collected,
  onClose,
}: {
  events: GameEvent[];
  collected: Collected;
  onClose: () => void;
}) {
  const snapshot = useCity((s) => s.snapshot)!;
  const [expanded, setExpanded] = useState(false);
  const lines = buildLines(events, collected, snapshot.players, snapshot.works);

  // Si no pasó nada mientras no estaba, no hay nada que contar.
  if (lines.length === 0) return null;

  const shown = expanded ? lines : lines.slice(0, MAX_LINES);
  const hidden = lines.length - shown.length;

  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Mientras no estabas">
        <h2>Mientras no estabas</h2>
        <ul className="summary">
          {shown.map((line) => (
            <li key={line.key}>{line.node}</li>
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" className="link more" onClick={() => setExpanded(true)}>
            y {plural(hidden, 'cosa más', 'cosas más')}
          </button>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            Ver la ciudad
          </button>
        </div>
      </div>
    </div>
  );
}

type Line = { key: string; node: ReactNode };
type Player = { id: string; display_name: string };

function buildLines(
  events: GameEvent[],
  collected: Collected,
  players: Player[],
  works: PublicWork[],
): Line[] {
  const names = new Map(players.map((p) => [p.id, p.display_name]));
  const nameOf = (id: string | null) => names.get(id ?? '') ?? 'Alguien';
  const of = (type: string) => events.filter((e) => e.type === type);
  const payload = (e: GameEvent) => (e.payload ?? {}) as Record<string, unknown>;
  const lines: Line[] = [];

  // 1. Construcciones propias terminadas.
  for (const e of of('construction.completed')) {
    const p = payload(e);
    lines.push({
      key: `c${e.id}`,
      node: (
        <>
          Tu <strong>{BUILDING_LABEL[p.building_type as BuildingType].toLowerCase()}</strong> subió a nivel {String(p.level)}.
        </>
      ),
    });
  }

  // 2. Ayudas recibidas, agrupadas por quién.
  const helpers = unique(of('construction.helped').map((e) => nameOf(e.actor_id)));
  if (helpers.length > 0) {
    lines.push({
      key: 'helps',
      node: (
        <>
          {strongList(helpers)} {helpers.length === 1 ? 'ayudó' : 'ayudaron'} en tu construcción.
        </>
      ),
    });
  }

  // 3. Regalos recibidos.
  for (const e of of('gift.sent')) {
    const p = payload(e);
    lines.push({
      key: `g${e.id}`,
      node: (
        <>
          <strong>{nameOf(e.actor_id)}</strong> te regaló {String(p.amount)} de {MATERIAL_LABEL[p.material as Material]}.
        </>
      ),
    });
  }

  // 4. Cuidados recibidos.
  const carers = unique(of('lot.cared').map((e) => nameOf(e.actor_id)));
  if (carers.length > 0) {
    lines.push({
      key: 'cares',
      node: (
        <>
          {strongList(carers)} {carers.length === 1 ? 'cuidó' : 'cuidaron'} tu lote.
        </>
      ),
    });
  }

  // 5. Obras públicas: las completadas y, si no, cuánto avanzaron.
  const completed = new Set(of('public_work.completed').map((e) => String(payload(e).public_work_id)));
  for (const id of completed) {
    const work = works.find((w) => w.id === id);
    lines.push({
      key: `wc${id}`,
      node: (
        <>
          Se terminó la obra <strong>{work?.name ?? 'del barrio'}</strong>.
        </>
      ),
    });
  }
  for (const [id, before] of progressBefore(of('public_work.contributed'), works)) {
    if (completed.has(id)) continue;
    const work = works.find((w) => w.id === id);
    if (!work) continue;
    const to = workPercent(work);
    const from = workPercent({ cost: work.cost, progress: before });
    if (to === from) continue;
    lines.push({
      key: `wp${id}`,
      node: (
        <>
          La obra <strong>{work.name}</strong> avanzó del {from} % al {to} %.
        </>
      ),
    });
  }

  // 6. Barrio abierto.
  for (const e of of('barrio.opened')) {
    lines.push({
      key: `b${e.id}`,
      node: (
        <>
          Se abrió el <strong>{String(payload(e).name)}</strong>.
        </>
      ),
    });
  }

  // 7. Vecinos nuevos cerca.
  const newcomers = unique(of('player.joined').map((e) => String(payload(e).display_name ?? nameOf(e.actor_id))));
  if (newcomers.length > 0) {
    lines.push({
      key: 'joined',
      node: (
        <>
          {strongList(newcomers)} {newcomers.length === 1 ? 'fundó su lote' : 'fundaron sus lotes'} cerca del tuyo.
        </>
      ),
    });
  }

  // 8. Visitas recibidas.
  const visitors = unique(of('lot.visited').map((e) => e.actor_id ?? ''));
  if (visitors.length > 0) {
    lines.push({
      key: 'visits',
      node: (
        <>
          <strong>{plural(visitors.length, 'vecino pasó', 'vecinos pasaron')}</strong> por tu lote.
        </>
      ),
    });
  }

  // 9. Lo que se recogió al entrar.
  if (collected.material && collected.amount) {
    lines.push({
      key: 'collected',
      node: (
        <>
          Recogiste <strong>{collected.amount} de {MATERIAL_LABEL[collected.material]}</strong>.
        </>
      ),
    });
  }

  return lines;
}

// Progreso que tenía cada obra antes de la ausencia: el actual menos lo aportado desde entonces.
// Los aportes no guardan la jornada en el payload, pero cada uno suma exactamente una.
function progressBefore(contributions: GameEvent[], works: PublicWork[]): Map<string, WorkAmounts> {
  const before = new Map<string, WorkAmounts>();
  for (const e of contributions) {
    const p = (e.payload ?? {}) as Record<string, number | string>;
    const id = String(p.public_work_id);
    const work = works.find((w) => w.id === id);
    if (!work) continue;
    const acc = before.get(id) ?? workAmounts(work.progress);
    before.set(id, {
      ladrillo: acc.ladrillo - Number(p.ladrillo ?? 0),
      madera: acc.madera - Number(p.madera ?? 0),
      energia: acc.energia - Number(p.energia ?? 0),
      jornadas: acc.jornadas - 1,
    });
  }
  return before;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// "Marta", "Marta y Juan", "Marta, Juan y Ana".
function strongList(names: string[]): ReactNode {
  return names.map((name, i) => (
    <span key={name}>
      {i > 0 && (i === names.length - 1 ? ' y ' : ', ')}
      <strong>{name}</strong>
    </span>
  ));
}
