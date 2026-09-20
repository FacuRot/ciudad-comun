// Lecturas directas a las tablas, bajo RLS (docs/06-acciones-y-api.md, "Lecturas").
import { sb } from './client';
import { codeOf, GameError } from './errors';
import type { CitySnapshot } from '../store/city';
import type { Barrio, Inventory, Player } from '../types/game';

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
    sb.from('players').select('id, display_name, last_seen_at, created_at'),
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

// Quiénes ayudaron en una construcción, en orden.
export async function loadHelps(constructionId: string): Promise<{ helper_id: string; created_at: string }[]> {
  return unwrap(
    await sb
      .from('construction_helps')
      .select('helper_id, created_at')
      .eq('construction_id', constructionId)
      .order('created_at'),
  );
}

// Placa de una obra: un renglón por aporte. El panel los agrupa por jugador.
export async function loadContributions(
  workId: string,
): Promise<{ player_id: string; ladrillo: number; madera: number; energia: number }[]> {
  return unwrap(
    await sb
      .from('public_work_contributions')
      .select('player_id, ladrillo, madera, energia')
      .eq('public_work_id', workId)
      .order('created_at'),
  );
}

// Quién pasó por un lote en los últimos días. lot_visits no es legible bajo RLS:
// se leen los eventos lot.visited, que sí lo son dentro de la ciudad.
export async function loadVisits(lotId: string, days: number): Promise<{ actor_id: string | null; created_at: string }[]> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  return unwrap(
    await sb
      .from('events')
      .select('actor_id, created_at')
      .eq('type', 'lot.visited')
      .eq('lot_id', lotId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
  );
}

export async function loadMe(uid: string): Promise<{ me: Player | null; inventory: Inventory | null }> {
  const [me, inventory] = await Promise.all([
    sb.from('players').select('*').eq('id', uid).maybeSingle(),
    sb.from('inventories').select('*').eq('player_id', uid).maybeSingle(),
  ]);
  return { me: unwrap(me), inventory: unwrap(inventory) };
}

// Los barrios solos, para el panel de administración (que no carga la ciudad entera).
export async function loadBarrios(): Promise<Barrio[]> {
  return unwrap(await sb.from('barrios').select('*').order('ordinal'));
}
