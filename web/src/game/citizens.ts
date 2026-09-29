// Ciudadanos vistos desde el cliente (docs/05-reglas-y-parametros.md §16), con la misma
// cuenta que fx_barrio_capacity y fx_barrio_attractiveness. Solo sirve para mostrar:
// la población la mueve el servidor una vez por día.
import { lotRate } from './production';
import type { Barrio, CityConfig, Lot, PublicWork } from '../types/game';

export type FactorKey = 'lotes' | 'calles' | 'abastecimiento' | 'obra';
export const FACTOR_KEYS: FactorKey[] = ['lotes', 'calles', 'abastecimiento', 'obra'];

export type Factors = Record<FactorKey, number>;

export type Attractiveness = {
  value: number; // entre 0 y 1, redondeado a 4 decimales como en el servidor
  factors: Factors;
  mainReason: FactorKey | null; // el que más resta; null si ninguno
  losses: Factors; // cuánto resta cada uno: peso × (1 − factor)
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

// Lo que aloja un lote con edificio: 10, o lo del nivel si es residencial (§16.1 y §17).
// Durante una mejora cuenta el nivel que tiene, que es el anterior.
export function lotCapacity(lot: Lot, cfg: CityConfig): number {
  if (lot.level === 0) return 0;
  if (lot.building_type === 'residencial') return cfg.residential.capacity_by_level[String(lot.level)] ?? 0;
  return cfg.citizens.capacity_per_lot;
}

// Lo que alojan los lotes del barrio con edificio de nivel 1 o más (§16.1).
export function barrioCapacity(barrioId: string, lots: Lot[], cfg: CityConfig): number {
  return lots.filter((l) => l.barrio_id === barrioId).reduce((sum, l) => sum + lotCapacity(l, cfg), 0);
}

// Producción del barrio por día, de cualquier material: lo que mide el abastecimiento.
// Con la tasa de §3 y sin el alquiler de los residenciales (§17.1).
export function barrioSupplyPerDay(barrioId: string, lots: Lot[], works: PublicWork[], cfg: CityConfig): number {
  let perHour = 0;
  for (const lot of lots) {
    if (lot.barrio_id === barrioId && lot.level > 0 && lot.building_type !== 'residencial') {
      perHour += lotRate(lot, lots, works, cfg).total;
    }
  }
  return perHour * 24;
}

// Promedio ponderado de los cuatro factores (§16.2). Cada factor se redondea antes de
// ponderar, igual que en fx_barrio_attractiveness, para que el objetivo dé lo mismo.
export function barrioAttractiveness(barrio: Barrio, lots: Lot[], works: PublicWork[], cfg: CityConfig): Attractiveness {
  const owned = lots.filter((l) => l.barrio_id === barrio.id && l.owner_id !== null);
  const stateFactor = cfg.production.state_factor;
  const lotes = owned.length ? owned.reduce((sum, l) => sum + (stateFactor[l.state] ?? 1), 0) / owned.length : 1;

  const demand = barrio.population * cfg.citizens.consumption_per_day;
  const abastecimiento = demand > 0 ? Math.min(1, barrioSupplyPerDay(barrio.id, lots, works, cfg) / demand) : 1;

  const obra = works.some((w) => w.barrio_id === barrio.id && w.status === 'en_curso') ? 0 : 1;

  const factors: Factors = { lotes: round4(lotes), calles: 1, abastecimiento: round4(abastecimiento), obra };
  const weights = cfg.citizens.weights;
  let total = 0;
  let weightSum = 0;
  let worst = 0;
  let mainReason: FactorKey | null = null;
  const losses = {} as Factors;
  for (const key of FACTOR_KEYS) {
    total += weights[key] * factors[key];
    weightSum += weights[key];
    losses[key] = weights[key] * (1 - factors[key]);
    // Un margen mínimo para que el redondeo de los decimales no invente un empate.
    if (losses[key] > worst + 1e-9) {
      worst = losses[key];
      mainReason = key;
    }
  }
  return { value: round4(total / weightSum), factors, mainReason, losses };
}

// Hacia dónde va la población mañana: floor(capacidad × atractivo) (§16.3).
export function populationTarget(capacity: number, attractiveness: number): number {
  return Math.floor(capacity * attractiveness + 1e-9);
}

// 1: van a llegar; -1: se van a ir; 0: ya está en el objetivo.
export function populationTrend(population: number, target: number): 1 | 0 | -1 {
  return population < target ? 1 : population > target ? -1 : 0;
}
