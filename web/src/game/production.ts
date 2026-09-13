// Producción vista desde el cliente, con la misma cuenta que fx_effective_rate (docs/05 §3).
// Solo sirve para mostrar: lo que se recoge lo calcula el servidor.
import { manhattan } from './geo';
import type { CityConfig, Construction, Lot, Material, PublicWork } from '../types/game';

export type Rate = {
  material: Material | null; // null: sin edificio o plaza
  base: number;
  plazaBonus: number; // fracción: 0, 0,1, 0,2
  workBonus: number; // fracción: 0 o la de la obra del barrio
  stateFactor: number; // 1, 0,5 o 0
  total: number; // unidades por hora
};

export function effectiveRate(lot: Lot, lots: Lot[], works: PublicWork[], cfg: CityConfig): Rate {
  const material = lot.building_type ? cfg.buildings.produces[lot.building_type] : null;
  if (lot.level === 0 || !material) {
    return { material, base: 0, plazaBonus: 0, workBonus: 0, stateFactor: 1, total: 0 };
  }
  const p = cfg.production;
  const base = p.rate_by_level[String(lot.level)] ?? 0;
  const plazas = lots.filter(
    (n) => n.building_type === 'plaza' && n.level > 0 && n.state === 'activo' && manhattan(n, lot) === 1,
  ).length;
  const plazaBonus = Math.min(plazas * p.plaza_bonus, p.plaza_bonus_cap);
  const workDone = works.some((w) => w.barrio_id === lot.barrio_id && w.status === 'completada');
  const workBonus = workDone ? p.public_work_bonus : 0;
  const stateFactor = p.state_factor[lot.state] ?? 1;
  return { material, base, plazaBonus, workBonus, stateFactor, total: base * (1 + plazaBonus) * (1 + workBonus) * stateFactor };
}

// "En tu barrio escasea: X" (docs/07, panel Mi lote): el material con menor producción total del barrio.
// Si empatan (al principio todos producen cero), el que menos lotes tienen encaminado, contando
// las construcciones en curso; después, el orden de la config.
export function scarceMaterial(
  barrioId: string,
  lots: Lot[],
  works: PublicWork[],
  constructions: Construction[],
  cfg: CityConfig,
): Material {
  const total = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  const planned = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  for (const lot of lots) {
    if (lot.barrio_id !== barrioId || lot.status !== 'ocupado') continue;
    const rate = effectiveRate(lot, lots, works, cfg);
    if (rate.material) total.set(rate.material, total.get(rate.material)! + rate.total);
    const type = lot.building_type ?? constructions.find((c) => c.lot_id === lot.id)?.building_type;
    const material = type ? cfg.buildings.produces[type] : null;
    if (material) planned.set(material, planned.get(material)! + 1);
  }
  return [...cfg.materials.types].sort((a, b) => total.get(a)! - total.get(b)! || planned.get(a)! - planned.get(b)!)[0];
}

// Lotes del barrio que ya producen un material: a quién pedirle.
export function producersOf(material: Material, barrioId: string, lots: Lot[], cfg: CityConfig, exceptOwner: string): Lot[] {
  return lots.filter(
    (l) =>
      l.barrio_id === barrioId &&
      l.status === 'ocupado' &&
      l.owner_id !== exceptOwner &&
      l.level > 0 &&
      l.building_type !== null &&
      cfg.buildings.produces[l.building_type] === material,
  );
}
