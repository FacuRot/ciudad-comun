// Un wrapper tipado por RPC (docs/06-acciones-y-api.md). Traduce errores y actualiza el store.
import { sb } from './client';
import { codeOf, GameError } from './errors';
import { refreshMe } from './sync';
import { useCity } from '../store/city';
import type {
  Barrio,
  BuildingType,
  Construction,
  GameEvent,
  JoinMap,
  Lot,
  LotState,
  Material,
  PublicWork,
  WorkAmounts,
} from '../types/game';

export type InvitationInfo = {
  valid: boolean;
  city_id: string;
  inviter: string | null;
  lot_hint: string | null;
};

// null si el token no existe.
export async function invitationInfo(token: string): Promise<InvitationInfo | null> {
  const { data, error } = await sb.rpc('invitation_info', { p_token: token });
  if (error) throw new GameError(codeOf(error));
  return (data as InvitationInfo | null) ?? null;
}

// Mapa de la ciudad para la pantalla de entrada. null si el token no es válido.
export async function invitationMap(token: string): Promise<JoinMap | null> {
  const { data, error } = await sb.rpc('invitation_map', { p_token: token });
  if (error) throw new GameError(codeOf(error));
  return (data as unknown as JoinMap | null) ?? null;
}

export async function claimLot(p: {
  token: string;
  displayName: string;
  lotId: string;
  lotName: string;
  color: string;
}): Promise<Lot> {
  const { data, error } = await sb.rpc('claim_lot', {
    p_token: p.token,
    p_display_name: p.displayName,
    p_lot_id: p.lotId,
    p_lot_name: p.lotName,
    p_color: p.color,
  });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyLot(data as Lot);
  return data as Lot;
}

export type Heartbeat = {
  hours_away: number;
  since: string;
  // Vacío si no había nada para recoger. Con attractiveness si fue el alquiler de un residencial.
  collected: { material?: Material; amount?: number; attractiveness?: number };
  show_summary: boolean;
};

// Al abrir la app y al volver a la pestaña: recoge la producción y marca que el jugador está.
// No devuelve jornadas ni inventario, así que después se releen para la barra superior.
export async function heartbeat(): Promise<Heartbeat> {
  const { data, error } = await sb.rpc('heartbeat');
  if (error) throw new GameError(codeOf(error));
  await refreshMe();
  return data as unknown as Heartbeat;
}

export async function renameLot(name: string): Promise<void> {
  const { error } = await sb.rpc('rename_lot', { p_name: name });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().patchMyLot({ name });
}

export async function recolorLot(color: string): Promise<void> {
  const { error } = await sb.rpc('recolor_lot', { p_color: color });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().patchMyLot({ color });
}

// Nivel 1 (elige el tipo) o mejora al siguiente nivel. El residencial pide, en el nivel 1,
// qué material cobra de alquiler; en las mejoras ya lo tiene el lote.
export async function build(type: BuildingType, rentMaterial?: Material): Promise<Construction> {
  const { data, error } = await sb.rpc('build', { p_building_type: type, p_rent_material: rentMaterial });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyConstruction(data as Construction);
  // El lote guardó el material del alquiler: Realtime lo trae igual, pero así el panel no lo espera.
  if (rentMaterial) useCity.getState().patchMyLot({ rent_material: rentMaterial });
  // Gastó una jornada y materiales (y recogió producción): si la relectura falla, la corrige la próxima.
  await refreshMe().catch(() => {});
  return data as Construction;
}

// Ayudar la construcción de un vecino: 1 jornada, resta help.hours_reduced a ends_at.
export async function helpConstruction(constructionId: string): Promise<Construction> {
  const { data, error } = await sb.rpc('help_construction', { p_construction_id: constructionId });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyConstruction(data as Construction);
  await refreshMe().catch(() => {});
  return data as Construction;
}

// Aportar a una obra pública: 1 jornada y los materiales que se quieran (el servidor recorta a lo que falta).
export async function contribute(workId: string, amounts: { ladrillo: number; madera: number; energia: number }): Promise<PublicWork> {
  const { data, error } = await sb.rpc('contribute', {
    p_public_work_id: workId,
    p_l: amounts.ladrillo,
    p_m: amounts.madera,
    p_e: amounts.energia,
  });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyWork(data as PublicWork);
  await refreshMe().catch(() => {});
  return data as PublicWork;
}

// Cuidar el lote de un vecino ausente: 1 jornada, suma care.days_added días de gracia.
export async function careLot(lotId: string): Promise<Lot> {
  const { data, error } = await sb.rpc('care_lot', { p_lot_id: lotId });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyLot(data as Lot);
  await refreshMe().catch(() => {});
  return data as Lot;
}

// Mantener las calles de un barrio abierto: 1 jornada y streets.cost, suma streets.points.
export async function maintainStreets(barrioId: string): Promise<Barrio> {
  const { data, error } = await sb.rpc('maintain_streets', { p_barrio_id: barrioId });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyBarrio(data as Barrio);
  await refreshMe().catch(() => {});
  return data as Barrio;
}

// Regalar materiales: sin jornada, mínimo gift.min_amount.
export async function gift(toPlayer: string, material: Material, amount: number): Promise<void> {
  const { error } = await sb.rpc('gift', { p_to_player: toPlayer, p_material: material, p_amount: amount });
  if (error) throw new GameError(codeOf(error));
  await refreshMe().catch(() => {});
}

// Se llama al abrir el panel de un lote ajeno. No pasa nada si falla: es solo registro.
export async function visitLot(lotId: string): Promise<void> {
  await sb.rpc('visit_lot', { p_lot_id: lotId });
}

// Eventos relevantes desde la última vez, para el modal "Mientras no estabas".
export async function getSummary(since: string): Promise<GameEvent[]> {
  const { data, error } = await sb.rpc('get_summary', { p_since: since });
  if (error) throw new GameError(codeOf(error));
  return (data as GameEvent[]) ?? [];
}

// Token nuevo para invitar. El cliente arma la URL /join/<token>.
export async function createInvitation(): Promise<string> {
  const { data, error } = await sb.rpc('create_invitation');
  if (error) throw new GameError(codeOf(error));
  return data as string;
}

// ---------------------------------------------------------------------
// Administración (docs/07-pantallas-y-flujos.md §3). Todas exigen players.is_admin.
// ---------------------------------------------------------------------

export type CityStats = {
  players: number;
  active_today: number;
  lots_free: number;
  lots_by_state: Record<LotState, number> | null;
  constructions_active: number;
  works: { name: string; status: string; cost: WorkAmounts; progress: WorkAmounts }[] | null;
  pending_notifications: number;
  new_players_24h: string[] | null;
};

export async function adminCityStats(): Promise<CityStats> {
  const { data, error } = await sb.rpc('admin_city_stats');
  if (error) throw new GameError(codeOf(error));
  return data as unknown as CityStats;
}

export async function adminForceOpenBarrio(barrioId: string): Promise<void> {
  const { error } = await sb.rpc('admin_force_open_barrio', { p_barrio_id: barrioId });
  if (error) throw new GameError(codeOf(error));
}

export type PendingNotification = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  player_id: string;
  display_name: string;
};

// Lo que el Mago de Oz todavía no mandó: el equipo avisa a mano y marca.
export async function adminPendingNotifications(limit?: number): Promise<PendingNotification[]> {
  const { data, error } = await sb.rpc('admin_pending_notifications', { p_limit: limit });
  if (error) throw new GameError(codeOf(error));
  return (data as unknown as PendingNotification[]) ?? [];
}

// Devuelve cuántos marcó: los que ya estaban enviados no cuentan.
export async function adminMarkNotified(ids: number[]): Promise<number> {
  const { data, error } = await sb.rpc('admin_mark_notified', { p_ids: ids });
  if (error) throw new GameError(codeOf(error));
  return (data as number) ?? 0;
}

export type AdminInvitation = {
  token: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
  inviter: string | null;
  lot_hint_name: string | null;
};

export async function adminInvitations(): Promise<AdminInvitation[]> {
  const { data, error } = await sb.rpc('admin_invitations');
  if (error) throw new GameError(codeOf(error));
  return (data as unknown as AdminInvitation[]) ?? [];
}
