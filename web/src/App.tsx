import { useEffect, type ReactNode } from 'react';
import { sb } from './api/client';
import { loadMe } from './api/reads';
import { useCity } from './store/city';
import { navigate, usePath } from './router';
import { AdminGate } from './screens/AdminScreen';
import { CityGate } from './screens/CityScreen';
import { JoinScreen } from './screens/JoinScreen';

export function App() {
  const path = usePath();
  const authReady = useCity((s) => s.authReady);
  useAuth();

  const join = path.match(/^\/join\/([^/]+)/);
  useEffect(() => {
    if (!join && path !== '/city' && path !== '/admin') navigate('/city', true);
  }, [path, join]);

  if (!authReady) return <Notice>Cargando…</Notice>;
  if (join) return <JoinScreen token={decodeURIComponent(join[1])} />;
  if (path === '/admin') return <AdminGate />;
  return <CityGate />;
}

// Sigue la sesión de Supabase y carga el jugador del usuario (si ya fundó).
function useAuth() {
  const setSession = useCity((s) => s.setSession);
  const setMe = useCity((s) => s.setMe);
  const uid = useCity((s) => s.session?.user.id);

  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => data.subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    if (!uid) {
      setMe(null, null);
      return;
    }
    let cancelled = false;
    loadMe(uid)
      .then(({ me, inventory }) => !cancelled && setMe(me, inventory))
      .catch(() => !cancelled && setMe(null, null));
    return () => {
      cancelled = true;
    };
  }, [uid, setMe]);
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
