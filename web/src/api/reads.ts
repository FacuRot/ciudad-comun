// Lecturas directas a las tablas, bajo RLS (docs/06-acciones-y-api.md, "Lecturas").
import { sb } from './client';
import { codeOf, GameError } from './errors';
import type { CitySnapshot } from '../store/city';
import type { Inventory, Player } from '../types/game';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new GameError(codeOf(result.error));
  return result.data as T;
}

export async function loadCity(): Promise<CitySnapshot> {
  const [city, lots, barrios, works, constructions, players] = await Promise.all([
    sb.from('cities').select('*').single(),
    sb.from('lots').select('*'),
    sb.from('barrios').select('*').order('ordinal'),
    sb.from('public_works').select('*'),
    sb.from('constructions').select('*').is('completed_at', null),
    sb.from('players').select('id, display_name, last_seen_at'),
  ]);
  return {
    city: unwrap(city),
    lots: unwrap(lots),
    barrios: unwrap(barrios),
    works: unwrap(works),
    constructions: unwrap(constructions),
    players: unwrap(players),
  };
}

export async function loadMe(uid: string): Promise<{ me: Player | null; inventory: Inventory | null }> {
  const [me, inventory] = await Promise.all([
    sb.from('players').select('*').eq('id', uid).maybeSingle(),
    sb.from('inventories').select('*').eq('player_id', uid).maybeSingle(),
  ]);
  return { me: unwrap(me), inventory: unwrap(inventory) };
}
