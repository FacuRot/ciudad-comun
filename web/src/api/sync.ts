// Relecturas que dejan el store al día con la base.
import { loadMe } from './reads';
import { useCity } from '../store/city';

// Jugador e inventario. Las RPC que gastan jornadas o materiales no los devuelven.
export async function refreshMe(): Promise<void> {
  const s = useCity.getState();
  const uid = s.session?.user.id;
  if (!uid) return;
  const { me, inventory } = await loadMe(uid);
  s.setMe(me, inventory);
}
