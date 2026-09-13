// Relecturas que dejan el store al día con la base.
import { loadCity, loadMe } from './reads';
import { useCity } from '../store/city';

// La carga inicial completa: ciudad, jugador e inventario. También es el polling de respaldo.
export async function refreshCity(): Promise<void> {
  const s = useCity.getState();
  const uid = s.session?.user.id;
  const [snapshot, mine] = await Promise.all([loadCity(), uid ? loadMe(uid) : null]);
  s.setSnapshot(snapshot);
  if (mine) s.setMe(mine.me, mine.inventory);
}

// Jugador e inventario. Las RPC que gastan jornadas o materiales no los devuelven.
export async function refreshMe(): Promise<void> {
  const s = useCity.getState();
  const uid = s.session?.user.id;
  if (!uid) return;
  const { me, inventory } = await loadMe(uid);
  s.setMe(me, inventory);
}
