// /join/:token (docs/07-pantallas-y-flujos.md §1).
// A: sin sesión → mapa de fondo + registro. B: con sesión y sin lote → elegir lote y fundar. C: con lote → /city.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { claimLot, invitationInfo, invitationMap, type InvitationInfo } from '../api/actions';
import { entrar, registrar } from '../api/auth';
import { GameError, messageOf } from '../api/errors';
import { loadMe } from '../api/reads';
import { useCity } from '../store/city';
import { navigate } from '../router';
import { CityCanvas } from '../renderer/CityCanvas';
import type { LotMark, Scene } from '../renderer/draw';
import { LOT_COLORS } from '../renderer/colors';
import { claimableLotIds, gridSize, suggestedLotIds, workPercent, type Cell } from '../game/geo';
import type { JoinMap, MapLot } from '../types/game';
import { Notice } from '../App';

export function JoinScreen({ token }: { token: string }) {
  const session = useCity((s) => s.session);
  const me = useCity((s) => s.me);
  const meReady = useCity((s) => s.meReady);
  const [info, setInfo] = useState<InvitationInfo | null | undefined>(undefined); // undefined: cargando
  const [map, setMap] = useState<JoinMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    invitationInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [token]);

  const refreshMap = useCallback(() => {
    invitationMap(token)
      .then(setMap)
      .catch(() => setMap(null));
  }, [token]);
  useEffect(() => refreshMap(), [refreshMap]);

  // Estado C: ya tiene lote.
  useEffect(() => {
    if (me) navigate('/city', true);
  }, [me]);

  const choosing = !!session && meReady && !me;

  const view = useMemo(() => {
    if (!map) return null;
    const marks = new Map<string, LotMark>();
    if (choosing) {
      const claimable = claimableLotIds(map.lots, map.max_claim_distance);
      const suggested = suggestedLotIds(map.lots, info?.lot_hint ?? null);
      for (const lot of map.lots) {
        if (lot.status !== 'libre') continue;
        marks.set(lot.id, !claimable.has(lot.id) ? 'blocked' : suggested.has(lot.id) ? 'suggested' : 'claimable');
      }
    }
    const scene: Scene = {
      ...gridSize(map.lots, map.works),
      lots: map.lots,
      works: map.works,
      barrios: map.barrios,
      timezone: map.timezone,
      marks,
      selectedLotId: selectedId,
    };
    return { scene, marks };
  }, [map, info, choosing, selectedId]);

  const lotAt = (c: Cell) => map?.lots.find((l) => l.x === c.x && l.y === c.y);

  const tooltip = (c: Cell) => {
    const work = map?.works.find((w) => w.x === c.x && w.y === c.y);
    if (work) return `${work.name} · ${workPercent(work)} %`;
    const lot = lotAt(c);
    if (!lot || lot.status === 'cerrado') return null;
    if (lot.status === 'ocupado') return lot.name;
    return view?.marks.get(lot.id) === 'blocked' ? 'Lejos de los vecinos' : 'Lote libre';
  };

  const pick = (c: Cell) => {
    const lot = lotAt(c);
    const mark = lot ? view?.marks.get(lot.id) : undefined;
    if (!lot || !mark) return;
    if (mark === 'blocked') {
      setHint(new GameError('LOT_ISOLATED').message);
      return;
    }
    setHint(null);
    setSelectedId(lot.id);
  };

  if (info === undefined || (session && !meReady) || me) return <Notice>Cargando…</Notice>;
  if (!info || !info.valid) return <Notice>{new GameError('BAD_INVITE').message}</Notice>;

  const selected = map?.lots.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="join">
      <div className="map">
        {view && <CityCanvas scene={view.scene} tooltip={tooltip} onCellClick={choosing ? pick : undefined} />}
      </div>
      {!session && <CuentaCard inviter={info.inviter} />}
      {choosing && !selected && (
        <div className="card">
          <p>
            {hint ??
              'Tocá un lote con borde punteado para fundar el tuyo.' +
                (info.lot_hint ? ' Los que laten están al lado de quien te invitó.' : '')}
          </p>
        </div>
      )}
      {choosing && selected && map && (
        <FoundCard
          token={token}
          lot={selected}
          palette={map.palette}
          onCancel={() => setSelectedId(null)}
          onLost={(message) => {
            setSelectedId(null);
            setHint(message);
            refreshMap();
          }}
        />
      )}
    </div>
  );
}

const MIN_CLAVE = 8;

// Estado A. La misma tarjeta sirve para crear la cuenta o para entrar con una que ya existe
// (quien se registró y se fue antes de fundar vuelve por este mismo link). Sin navegar:
// al haber sesión, JoinScreen pasa solo al estado B.
function CuentaCard({ inviter }: { inviter: string | null }) {
  const [nueva, setNueva] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (nueva) await registrar(email.trim(), password);
      else await entrar(email.trim(), password);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  const cambiarModo = () => {
    setNueva(!nueva);
    setError(null);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>
        {inviter ? (
          <>
            <strong>{inviter}</strong> te invitó a Ciudad Común
          </>
        ) : (
          'Te invitaron a Ciudad Común'
        )}
      </h1>
      <label htmlFor="email">Tu email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label htmlFor="clave">{nueva ? `Elegí una contraseña (mínimo ${MIN_CLAVE} caracteres)` : 'Tu contraseña'}</label>
      <input
        id="clave"
        type="password"
        required
        minLength={nueva ? MIN_CLAVE : undefined}
        autoComplete={nueva ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || (nueva && password.length < MIN_CLAVE)}>
          {nueva ? 'Crear cuenta y elegir lote' : 'Entrar'}
        </button>
      </div>
      <p>
        <button type="button" className="link" onClick={cambiarModo}>
          {nueva ? 'Ya tengo cuenta' : 'Quiero crear una cuenta'}
        </button>
      </p>
    </form>
  );
}

const validName = (s: string) => s.trim().length >= 2 && s.trim().length <= 24;

function FoundCard(props: {
  token: string;
  lot: MapLot;
  palette: string[];
  onCancel: () => void;
  onLost: (message: string) => void;
}) {
  const { token, lot, palette, onCancel, onLost } = props;
  const uid = useCity((s) => s.session?.user.id);
  const setMe = useCity((s) => s.setMe);
  const [displayName, setDisplayName] = useState('');
  const [lotName, setLotName] = useState('');
  const [color, setColor] = useState(palette[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await claimLot({ token, displayName: displayName.trim(), lotId: lot.id, lotName: lotName.trim(), color });
      // Con el jugador cargado, JoinScreen redirige a /city.
      if (uid) {
        const { me, inventory } = await loadMe(uid);
        setMe(me, inventory);
      }
    } catch (err) {
      const code = err instanceof GameError ? err.code : 'UNKNOWN';
      // Ya tenía lote (otra pestaña, o volvió al link viejo): el lugar es la ciudad (docs/06).
      if (code === 'ALREADY_PLAYER') {
        if (uid) {
          const { me, inventory } = await loadMe(uid);
          setMe(me, inventory);
        }
        navigate('/city', true);
        return;
      }
      if (code === 'LOT_NOT_FREE' || code === 'LOT_ISOLATED') {
        onLost(messageOf(err));
        return;
      }
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>Tu lote</h1>
      <label htmlFor="apodo">Tu apodo (lo ven todos)</label>
      <input
        id="apodo"
        maxLength={24}
        autoComplete="nickname"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <label htmlFor="lote">Nombre del lote</label>
      <input id="lote" maxLength={24} value={lotName} onChange={(e) => setLotName(e.target.value)} />
      <label>Color</label>
      <div className="swatches" role="radiogroup" aria-label="Color">
        {palette.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            title={c}
            className={c === color ? 'swatch on' : 'swatch'}
            style={{ background: LOT_COLORS[c] }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Otro lote
        </button>
        <button className="primary" disabled={busy || !validName(displayName) || !validName(lotName)}>
          Fundar acá
        </button>
      </div>
    </form>
  );
}
