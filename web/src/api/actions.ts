// Un wrapper tipado por RPC (docs/06-acciones-y-api.md). Traduce errores y actualiza el store.
import { sb } from './client';
import { codeOf, GameError } from './errors';
import { refreshMe } from './sync';
import { useCity } from '../store/city';
import type { BuildingType, Construction, JoinMap, Lot } from '../types/game';

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

// Nivel 1 (elige el tipo) o mejora al siguiente nivel.
export async function build(type: BuildingType): Promise<Construction> {
  const { data, error } = await sb.rpc('build', { p_building_type: type });
  if (error) throw new GameError(codeOf(error));
  useCity.getState().applyConstruction(data as Construction);
  // Gastó una jornada y materiales (y recogió producción): si la relectura falla, la corrige la próxima.
  await refreshMe().catch(() => {});
  return data as Construction;
}
