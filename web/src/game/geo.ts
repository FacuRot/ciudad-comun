// Ayudas de presentación sobre la grilla. El servidor valida todo de nuevo:
// esto solo decide qué se destaca en el mapa.
import type { MapLot, MapWork, WorkAmounts } from '../types/game';

export type Cell = { x: number; y: number };

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function gridSize(lots: Cell[], works: Cell[]): { cols: number; rows: number } {
  const cells = [...lots, ...works];
  return {
    cols: Math.max(0, ...cells.map((c) => c.x)) + 1,
    rows: Math.max(0, ...cells.map((c) => c.y)) + 1,
  };
}

// Lotes libres que se pueden tomar: cerca de un vecino no abandonado, o cualquiera si la ciudad está vacía.
export function claimableLotIds(lots: MapLot[], maxDistance: number): Set<string> {
  const neighbors = lots.filter((l) => l.status === 'ocupado' && l.state !== 'abandonado');
  const anyOccupied = lots.some((l) => l.status === 'ocupado');
  return new Set(
    lots
      .filter((l) => l.status === 'libre')
      .filter((l) => !anyOccupied || neighbors.some((n) => manhattan(n, l) <= maxDistance))
      .map((l) => l.id),
  );
}

// Lotes libres pegados al lote de quien invitó (sugerencia de vecindad).
export function suggestedLotIds(lots: MapLot[], hintLotId: string | null): Set<string> {
  const hint = lots.find((l) => l.id === hintLotId);
  if (!hint) return new Set();
  return new Set(lots.filter((l) => l.status === 'libre' && manhattan(l, hint) === 1).map((l) => l.id));
}

export function workAmounts(value: unknown): WorkAmounts {
  const v = (value ?? {}) as Partial<WorkAmounts>;
  return { ladrillo: v.ladrillo ?? 0, madera: v.madera ?? 0, energia: v.energia ?? 0, jornadas: v.jornadas ?? 0 };
}

// Progreso de una obra: promedio de los cuatro contadores, cada uno con tope en 100 %.
export function workPercent(work: Pick<MapWork, 'cost' | 'progress'>): number {
  const cost = workAmounts(work.cost);
  const progress = workAmounts(work.progress);
  const keys = ['ladrillo', 'madera', 'energia', 'jornadas'] as const;
  const ratios = keys.map((k) => (cost[k] > 0 ? Math.min(1, progress[k] / cost[k]) : 1));
  return Math.floor((ratios.reduce((a, b) => a + b, 0) / keys.length) * 100);
}
