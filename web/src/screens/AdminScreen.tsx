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
import { formatPoints, formatWhen } from '../game/format';
import { workAmounts, workPercent } from '../game/geo';
import type { Barrio } from '../types/game';
import { Notice } from '../App';
import { t } from '../i18n';

// /admin solo para quien tiene sesión, lote y is_admin.
export function AdminGate() {
  const session = useCity((s) => s.session);
  const me = useCity((s) => s.me);
  const meReady = useCity((s) => s.meReady);
  useEffect(() => {
    if (!session) navigate('/entrar', true);
  }, [session]);
  if (!session || !meReady) return <Notice>{t.common.loading}</Notice>;
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
  if (!data) return <Notice>{t.admin.loading}</Notice>;

  return (
    <div className="admin">
      <header>
        <h1>{t.admin.title}</h1>
        <div className="row">
          <button type="button" className="secondary" onClick={load} disabled={busy}>
            {t.admin.refresh}
          </button>
          <button type="button" className="secondary" onClick={() => navigate('/city')}>
            {t.admin.goToCity}
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
      <h2>{t.admin.cityTitle}</h2>
      <ul className="facts">
        <li>{t.admin.players(stats.players, stats.active_today)}</li>
        <li>
          {t.admin.lotsFree(stats.lots_free)} ·{' '}
          {states.length ? states.map(([s, n]) => `${n} ${t.lotState[s] ?? s}`).join(' · ') : t.admin.noOccupied}
        </li>
        <li>{t.admin.constructions(stats.constructions_active)}</li>
        <li>{t.admin.unsent(stats.pending_notifications)}</li>
      </ul>

      <h3>{t.admin.works}</h3>
      <ul className="facts">
        {(stats.works ?? []).map((w) => (
          <li key={w.name}>
            {w.name}: {formatPoints(workPercent({ cost: w.cost, progress: w.progress }))} ·{' '}
            {t.workStatus[w.status] ?? w.status}{' '}
            <span className="muted">
              {t.admin.workJornadas(workAmounts(w.progress).jornadas, workAmounts(w.cost).jornadas)}
            </span>
          </li>
        ))}
      </ul>

      <h3>{t.admin.newIn24h}</h3>
      <p>{nuevos.length ? nuevos.join(', ') : <span className="muted">{t.admin.nobodyNew}</span>}</p>
    </section>
  );
}

function Barrios({ barrios, onDone }: { barrios: Barrio[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (barrio: Barrio) => {
    if (!window.confirm(t.admin.confirmOpen(barrio.name))) return;
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
      <h2>{t.admin.barrios}</h2>
      {error && <p className="error">{error}</p>}
      <ul className="facts">
        {barrios.map((b) => (
          <li key={b.id}>
            {b.name} · {t.barrioStatus[b.status] ?? b.status}
            {b.opened_at && <span className="muted">{t.admin.since(formatWhen(b.opened_at))}</span>}
            {b.status === 'cerrado' && (
              <button type="button" className="secondary inline" disabled={busy === b.id} onClick={() => open(b)}>
                {t.admin.open}
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
      <h2>{t.admin.pending}</h2>
      {error && <p className="error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t.admin.nothingPending}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t.admin.to}</th>
              <th>{t.admin.notice}</th>
              <th>{t.admin.when}</th>
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
                    {t.admin.markSent}
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
      <h2>{t.admin.invitations}</h2>
      <p className="muted">
        {t.admin.validLinks(usable.length)}
        {rows.length > usable.length && t.admin.expiredLinks(rows.length - usable.length)}
      </p>
      {rows.length === 0 ? (
        <p className="muted">{t.admin.noInvitations}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t.admin.link}</th>
              <th>{t.admin.from}</th>
              <th>{t.admin.expires}</th>
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
                  {i.inviter ?? t.admin.team}
                  {i.lot_hint_name && <span className="muted"> · {i.lot_hint_name}</span>}
                </td>
                <td className="muted">{i.expired ? t.admin.expired : formatWhen(i.expires_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
