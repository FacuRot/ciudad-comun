// Panel de administración (docs/07-pantallas-y-flujos.md §3). Una página sin diseño:
// estado de la ciudad, apertura del barrio siguiente, outbox pendiente e invitaciones.
import { useCallback, useEffect, useState } from 'react';
import {
  adminCityStats,
  adminForceOpenBarrio,
  adminInvitations,
  adminMarkNotified,
  adminPendingNotifications,
  type AdminInvitation,
  type CityStats,
  type PendingNotification,
} from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadBarrios } from '../api/reads';
import { useCity } from '../store/city';
import { navigate } from '../router';
import { noticeFor } from '../game/events';
import { formatWhen, plural } from '../game/format';
import { workAmounts, workPercent } from '../game/geo';
import type { Barrio } from '../types/game';
import { Notice } from '../App';

// /admin solo para quien tiene sesión, lote y is_admin.
export function AdminGate() {
  const session = useCity((s) => s.session);
  const me = useCity((s) => s.me);
  const meReady = useCity((s) => s.meReady);
  if (!session) return <Notice>Entrá con tu email para ver el panel.</Notice>;
  if (!meReady) return <Notice>Cargando…</Notice>;
  if (!me?.is_admin) return <Notice>{new GameError('NOT_ADMIN').message}</Notice>;
  return <AdminScreen />;
}

type Data = {
  stats: CityStats;
  barrios: Barrio[];
  pending: PendingNotification[];
  invitations: AdminInvitation[];
};

function AdminScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [stats, barrios, pending, invitations] = await Promise.all([
        adminCityStats(),
        loadBarrios(),
        adminPendingNotifications(),
        adminInvitations(),
      ]);
      setData({ stats, barrios, pending, invitations });
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) return <Notice>{error}</Notice>;
  if (!data) return <Notice>Cargando el panel…</Notice>;

  return (
    <div className="admin">
      <header>
        <h1>Administración</h1>
        <div className="row">
          <button type="button" className="secondary" onClick={load} disabled={busy}>
            Actualizar
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/city')}>
            Ir a la ciudad
          </button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <Stats stats={data.stats} />
      <Barrios barrios={data.barrios} onDone={load} />
      <Pending rows={data.pending} onDone={load} />
      <Invitations rows={data.invitations} />
    </div>
  );
}

function Stats({ stats }: { stats: CityStats }) {
  const states = Object.entries(stats.lots_by_state ?? {});
  const nuevos = stats.new_players_24h ?? [];

  return (
    <section>
      <h2>La ciudad</h2>
      <ul className="facts">
        <li>
          <strong>{stats.players}</strong> jugadores · <strong>{stats.active_today}</strong> entraron hoy
        </li>
        <li>
          <strong>{stats.lots_free}</strong> lotes libres ·{' '}
          {states.length ? states.map(([s, n]) => `${n} ${s}`).join(' · ') : 'sin lotes ocupados'}
        </li>
        <li>
          <strong>{stats.constructions_active}</strong> construcciones en curso
        </li>
        <li>
          <strong>{stats.pending_notifications}</strong> avisos sin enviar
        </li>
      </ul>

      <h3>Obras</h3>
      <ul className="facts">
        {(stats.works ?? []).map((w) => (
          <li key={w.name}>
            {w.name}: {workPercent({ cost: w.cost, progress: w.progress })} % · {w.status}{' '}
            <span className="muted">
              (jornadas {workAmounts(w.progress).jornadas}/{workAmounts(w.cost).jornadas})
            </span>
          </li>
        ))}
      </ul>

      <h3>Nuevos en 24 h</h3>
      <p>{nuevos.length ? nuevos.join(', ') : <span className="muted">Nadie nuevo. Mandá invitaciones.</span>}</p>
    </section>
  );
}

function Barrios({ barrios, onDone }: { barrios: Barrio[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (barrio: Barrio) => {
    if (!window.confirm(`¿Abrir el ${barrio.name}? No se puede deshacer y le avisa a toda la ciudad.`)) return;
    setBusy(barrio.id);
    setError(null);
    try {
      await adminForceOpenBarrio(barrio.id);
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h2>Barrios</h2>
      {error && <p className="error">{error}</p>}
      <ul className="facts">
        {barrios.map((b) => (
          <li key={b.id}>
            {b.name} · {b.status}
            {b.opened_at && <span className="muted"> desde el {formatWhen(b.opened_at)}</span>}
            {b.status === 'cerrado' && (
              <button type="button" className="secondary inline" disabled={busy === b.id} onClick={() => open(b)}>
                Abrir
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Modo manual del Mago de Oz: se lee el aviso, se manda por WhatsApp y se marca.
function Pending({ rows, onDone }: { rows: PendingNotification[]; onDone: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      await adminMarkNotified([id]);
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h2>Avisos pendientes</h2>
      {error && <p className="error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">No hay nada sin enviar.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Para</th>
              <th>Aviso</th>
              <th>Cuándo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td>{n.display_name}</td>
                <td>{noticeFor(n.type, n.payload)}</td>
                <td className="muted">{formatWhen(n.created_at)}</td>
                <td>
                  <button type="button" className="secondary inline" disabled={busy === n.id} onClick={() => mark(n.id)}>
                    Marcar enviado
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Invitations({ rows }: { rows: AdminInvitation[] }) {
  const usable = rows.filter((i) => !i.expired);

  return (
    <section>
      <h2>Invitaciones sin usar</h2>
      <p className="muted">
        {plural(usable.length, 'link vigente', 'links vigentes')}
        {rows.length > usable.length && ` · ${rows.length - usable.length} vencidos`}
      </p>
      {rows.length === 0 ? (
        <p className="muted">No quedan invitaciones. Se crean desde el botón "Invitar" de la ciudad.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Link</th>
              <th>De</th>
              <th>Vence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.token} className={i.expired ? 'muted' : undefined}>
                <td>
                  <input
                    className="invite-url"
                    readOnly
                    value={`${window.location.origin}/join/${i.token}`}
                    onFocus={(e) => e.target.select()}
                  />
                </td>
                <td>
                  {i.inviter ?? 'el equipo'}
                  {i.lot_hint_name && <span className="muted"> · {i.lot_hint_name}</span>}
                </td>
                <td className="muted">{i.expired ? 'vencida' : formatWhen(i.expires_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
