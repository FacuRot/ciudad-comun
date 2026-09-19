// Panel de un lote ajeno (docs/07-pantallas-y-flujos.md): visitar, ayudar, cuidar y regalar.
import { useEffect, useState } from 'react';
import { careLot, gift, helpConstruction, visitLot } from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadHelps } from '../api/reads';
import { useCity } from '../store/city';
import {
  BUILDING_GLYPH,
  BUILDING_LABEL,
  MATERIAL_LABEL,
  daysSince,
  formatDay,
  formatRemaining,
  plural,
} from '../game/format';
import { configOf, type CityConfig, type Construction, type Lot, type Material, type PlayerPublic } from '../types/game';
import { PanelBack } from './PanelBack';

const MATERIALS: Material[] = ['ladrillo', 'madera', 'energia'];

export function OtherLotPanel({ lot, onBack }: { lot: Lot; onBack: () => void }) {
  const snapshot = useCity((s) => s.snapshot)!;
  const me = useCity((s) => s.me)!;
  const cfg = configOf(snapshot.city);
  const owner = snapshot.players.find((p) => p.id === lot.owner_id) ?? null;
  const construction = snapshot.constructions.find((c) => c.lot_id === lot.id) ?? null;

  // Abrir el panel es la visita (docs/06). Si falla no pasa nada: es solo registro.
  useEffect(() => {
    visitLot(lot.id).catch(() => {});
  }, [lot.id]);

  return (
    <aside className="panel">
      <section>
        <PanelBack onBack={onBack} />
        <h2>{lot.name}</h2>
        <p className="muted">
          {owner?.display_name ?? 'Alguien'}
          {owner && ` · por acá desde el ${formatDay(owner.created_at)}`}
        </p>
        {lot.level > 0 && lot.building_type ? (
          <p>
            <span className="glyph">{BUILDING_GLYPH[lot.building_type]}</span> {BUILDING_LABEL[lot.building_type]} ·
            nivel {lot.level}
          </p>
        ) : (
          <p className="muted">Todavía no construyó nada.</p>
        )}
        <p className={lot.state === 'activo' ? undefined : 'away'}>{stateText(lot, owner)}</p>
      </section>

      {construction && <HelpSection construction={construction} meId={me.id} jornadas={me.jornadas} cfg={cfg} />}
      {lot.state !== 'activo' && <CareSection lot={lot} jornadas={me.jornadas} cfg={cfg} />}
      {owner && <GiftSection to={owner} cfg={cfg} />}
    </aside>
  );
}

// "Activo", "Hace 5 días que no viene", "Abandonado hace 9 días" (docs/07, panel Lote ajeno).
function stateText(lot: Lot, owner: PlayerPublic | null): string {
  if (lot.state === 'activo') return 'Activo';
  const days = owner ? daysSince(owner.last_seen_at) : 0;
  if (lot.state === 'abandonado') return `Abandonado hace ${plural(days, 'día', 'días')}`;
  return `Hace ${plural(days, 'día', 'días')} que no viene`;
}

function HelpSection(props: { construction: Construction; meId: string; jornadas: number; cfg: CityConfig }) {
  const { construction, meId, jornadas, cfg } = props;
  const [helped, setHelped] = useState<boolean | null>(null); // null: todavía no se sabe
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = Date.parse(construction.ends_at) - Date.now();

  useEffect(() => {
    let cancelled = false;
    loadHelps(construction.id)
      .then((rows) => !cancelled && setHelped(rows.some((r) => r.helper_id === meId)))
      .catch(() => !cancelled && setHelped(false));
    return () => {
      cancelled = true;
    };
  }, [construction.id, construction.ends_at, meId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await helpConstruction(construction.id);
      setHelped(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>
        En obra: {BUILDING_LABEL[construction.building_type]} nivel {construction.target_level}
      </h3>
      <p className="rate">
        {left > 0 ? `Faltan ${formatRemaining(left)}` : 'Terminando: en unos minutos sube de nivel.'}
      </p>
      {helped && <p className="muted">Ya ayudaste en esta obra.</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || helped !== false || jornadas < 1} onClick={submit}>
          Ayudar (1 jornada, −{cfg.help.hours_reduced} h)
        </button>
      </div>
    </section>
  );
}

function CareSection({ lot, jornadas, cfg }: { lot: Lot; jornadas: number; cfg: CityConfig }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, cfg.care.max_per_absence - lot.care_count);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await careLot(lot.id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>Cuidar el lote</h3>
      <p className="muted">
        {left > 0
          ? `Le quedan ${plural(left, 'cuidado', 'cuidados')} hasta que vuelva su dueño.`
          : 'Ya recibió todos los cuidados posibles hasta que vuelva.'}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || left === 0 || jornadas < 1} onClick={submit}>
          Cuidar (1 jornada, +{cfg.care.days_added} días)
        </button>
      </div>
    </section>
  );
}

// Regalar no cuesta jornada: mínimo gift.min_amount, máximo lo que tengo.
function GiftSection({ to, cfg }: { to: PlayerPublic; cfg: CityConfig }) {
  const inventory = useCity((s) => s.inventory);
  const min = cfg.gift.min_amount;
  const [material, setMaterial] = useState<Material>('ladrillo');
  const [amount, setAmount] = useState(min);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const have = inventory?.[material] ?? 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      await gift(to.id, material, amount);
      setSent(`Le regalaste ${amount} de ${MATERIAL_LABEL[material]} a ${to.display_name}.`);
      setAmount(min);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>Regalar materiales</h3>
      <div className="types three" role="radiogroup" aria-label="Material a regalar">
        {MATERIALS.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={m === material}
            className={m === material ? 'type on' : 'type'}
            onClick={() => setMaterial(m)}
          >
            <span>{MATERIAL_LABEL[m]}</span>
            <small>tengo {inventory?.[m] ?? 0}</small>
          </button>
        ))}
      </div>
      <label className="amount">
        <span>Cantidad</span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={have}
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      </label>
      {amount > have && <p className="error">{new GameError('NO_MATERIALS').message}</p>}
      {amount < min && <p className="error">{new GameError('GIFT_TOO_SMALL').message}</p>}
      {error && <p className="error">{error}</p>}
      {sent && <p className="muted">{sent}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || amount < min || amount > have} onClick={submit}>
          Regalar
        </button>
      </div>
    </section>
  );
}
