import type { Database } from './db';

type Tables = Database['public']['Tables'];
type Enums = Database['public']['Enums'];

export type City = Tables['cities']['Row'];
export type Barrio = Tables['barrios']['Row'];
export type Lot = Tables['lots']['Row'];
export type PublicWork = Tables['public_works']['Row'];
export type Construction = Tables['constructions']['Row'];
export type Player = Tables['players']['Row'];
export type Inventory = Tables['inventories']['Row'];
export type PlayerPublic = Pick<Player, 'id' | 'display_name' | 'last_seen_at' | 'created_at'>;

export type BuildingType = Enums['building_t'];
export type Material = Enums['material_t'];
export type LotState = Enums['lot_state_t'];

export type WorkAmounts = { ladrillo: number; madera: number; energia: number; jornadas: number };

// Lo mínimo que necesita el mapa. En /city vienen las filas completas; en /join, lo que devuelve invitation_map.
export type MapLot = Pick<
  Lot,
  'id' | 'barrio_id' | 'x' | 'y' | 'status' | 'name' | 'color' | 'building_type' | 'level' | 'state'
>;
export type MapWork = Pick<PublicWork, 'id' | 'barrio_id' | 'name' | 'x' | 'y' | 'cost' | 'progress' | 'status'>;
export type MapBarrio = Pick<Barrio, 'id' | 'name' | 'ordinal' | 'status'>;

export type JoinMap = {
  timezone: string;
  palette: string[];
  max_claim_distance: number;
  lots: MapLot[];
  barrios: MapBarrio[];
  works: MapWork[];
};

// Forma de cities.config (docs/05-reglas-y-parametros.md §14). Solo lo que usa el cliente.
export type CityConfig = {
  jornadas: { per_day: number; cap: number; initial: number };
  materials: { types: Material[]; starter: Record<Material, number> };
  production: {
    rate_by_level: Record<string, number>;
    state_factor: Record<LotState, number>;
    plaza_bonus: number;
    plaza_bonus_cap: number;
    public_work_bonus: number;
  };
  buildings: {
    types: BuildingType[];
    produces: Record<BuildingType, Material | null>;
    levels: Record<string, { cost: Record<Material, number>; hours: number }>;
  };
  help: { hours_reduced: number; max_per_helper: number };
  care: { days_added: number; max_per_absence: number; min_state: LotState };
  decay: { descuidado_after_days: number; abandonado_after_days: number };
  gift: { min_amount: number };
  lots: { max_claim_distance: number };
  palette: string[];
};

export function configOf(city: City): CityConfig {
  return city.config as unknown as CityConfig;
}
