// Producción vista desde el cliente, con la misma cuenta que fx_lot_rate y fx_effective_rate
// (docs/05 §3 y §17.1). Solo sirve para mostrar: lo que se recoge lo calcula el servidor.
import { barrioAttractiveness } from './citizens';
import { manhattan } from './geo';
import type { Barrio, CityConfig, Construction, Lot, Material, PublicWork } from '../types/game';

export type Rate = {
  material: Material | null; // null: sin edificio o plaza
  base: number;
  plazaBonus: number; // fracción: 0, 0,1, 0,2
  workBonus: number; // fracción: 0 o la de la obra del barrio
  stateFactor: number; // 1, 0,5 o 0
  attractiveness: number; // 1, salvo el alquiler del residencial: el atractivo de su barrio
  total: number; // unidades por hora
};

// Lo que entrega un lote: el material de su tipo o, si es residencial, el del alquiler.
export function materialOf(lot: Pick<Lot, 'building_type' | 'rent_material'>, cfg: CityConfig): Material | null {
  if (!lot.building_type) return null;
  return lot.building_type === 'residencial' ? lot.rent_material : cfg.buildings.produces[lot.building_type];
}

// Tasa de §3, sin el atractivo (fx_lot_rate). Es la que mide el abastecimiento.
export function lotRate(lot: Lot, lots: Lot[], works: PublicWork[], cfg: CityConfig): Rate {
  const material = materialOf(lot, cfg);
  if (lot.level === 0 || !material) {
    return { material, base: 0, plazaBonus: 0, workBonus: 0, stateFactor: 1, attractiveness: 1, total: 0 };
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
  const total = base * (1 + plazaBonus) * (1 + workBonus) * stateFactor;
  return { material, base, plazaBonus, workBonus, stateFactor, attractiveness: 1, total };
}

// Tasa efectiva (fx_effective_rate): la de §3 y, si es un residencial, por el atractivo de su barrio.
export function effectiveRate(lot: Lot, lots: Lot[], works: PublicWork[], barrios: Barrio[], cfg: CityConfig): Rate {
  const rate = lotRate(lot, lots, works, cfg);
  const barrio = barrios.find((b) => b.id === lot.barrio_id);
  if (lot.building_type !== 'residencial' || rate.total === 0 || !barrio) return rate;
  const attractiveness = barrioAttractiveness(barrio, lots, works, cfg).value;
  return { ...rate, attractiveness, total: rate.total * attractiveness };
}

// "En tu barrio escasea: X" (docs/07, panel Mi lote): el material con menor producción total del barrio.
// Si empatan (al principio todos producen cero), el que menos lotes tienen encaminado, contando
// las construcciones en curso; después, el orden de la config.
// El alquiler de los residenciales cuenta: es material que llega a alguien del barrio.
export function scarceMaterial(
  barrioId: string,
  lots: Lot[],
  works: PublicWork[],
  barrios: Barrio[],
  constructions: Construction[],
  cfg: CityConfig,
): Material {
  const total = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  const planned = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  for (const lot of lots) {
    if (lot.barrio_id !== barrioId || lot.status !== 'ocupado') continue;
    const rate = effectiveRate(lot, lots, works, barrios, cfg);
    if (rate.material) total.set(rate.material, total.get(rate.material)! + rate.total);
    // El residencial guarda su material al empezar la obra, así que ya cuenta encaminado.
    const type = lot.building_type ?? constructions.find((c) => c.lot_id === lot.id)?.building_type ?? null;
    const material = materialOf({ building_type: type, rent_material: lot.rent_material }, cfg);
    if (material) planned.set(material, planned.get(material)! + 1);
  }
  return [...cfg.materials.types].sort((a, b) => total.get(a)! - total.get(b)! || planned.get(a)! - planned.get(b)!)[0];
}

// Lotes del barrio que ya producen un material, o lo cobran de alquiler: a quién pedirle.
export function producersOf(material: Material, barrioId: string, lots: Lot[], cfg: CityConfig, exceptOwner: string): Lot[] {
  return lots.filter(
    (l) =>
      l.barrio_id === barrioId &&
      l.status === 'ocupado' &&
      l.owner_id !== exceptOwner &&
      l.level > 0 &&
      materialOf(l, cfg) === material,
  );
}
