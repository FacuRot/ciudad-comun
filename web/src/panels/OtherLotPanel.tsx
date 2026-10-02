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
} from '../game/format';
import { configOf, type CityConfig, type Construction, type Lot, type Material, type PlayerPublic } from '../types/game';
import { PanelBack } from './PanelBack';
import { t } from '../i18n';

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
          {owner?.display_name ?? t.common.someone}
          {owner && t.otherLot.aroundSince(formatDay(owner.created_at))}
        </p>
        {lot.level > 0 && lot.building_type ? (
          <p>
            <span className="glyph">{BUILDING_GLYPH[lot.building_type]}</span> {BUILDING_LABEL[lot.building_type]} ·{' '}
            {t.common.level(lot.level)}
          </p>
        ) : (
          <p className="muted">{t.otherLot.nothingBuilt}</p>
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
  if (lot.state === 'activo') return t.otherLot.active;
  const days = owner ? daysSince(owner.last_seen_at) : 0;
  if (lot.state === 'abandonado') return t.otherLot.abandoned(days);
  return t.otherLot.away(days);
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
      <h3>{t.common.underConstruction(BUILDING_LABEL[construction.building_type], construction.target_level)}</h3>
      <p className="rate">{left > 0 ? t.common.left(formatRemaining(left)) : t.common.finishing}</p>
      {helped && <p className="muted">{t.errors.ALREADY_HELPED}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || helped !== false || jornadas < 1} onClick={submit}>
          {t.otherLot.help(cfg.help.hours_reduced)}
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
      <h3>{t.otherLot.careTitle}</h3>
      <p className="muted">
        {left > 0 ? t.otherLot.careLeft(left) : t.otherLot.careFull}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy || left === 0 || jornadas < 1} onClick={submit}>
          {t.otherLot.care(cfg.care.days_added)}
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
      setSent(t.otherLot.sent(amount, MATERIAL_LABEL[material], to.display_name));
      setAmount(min);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>{t.otherLot.giftTitle}</h3>
      <div className="types three" role="radiogroup" aria-label={t.otherLot.giftMaterial}>
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
            <small>{t.otherLot.have(inventory?.[m] ?? 0)}</small>
          </button>
        ))}
      </div>
      <label className="amount">
        <span>{t.otherLot.amount}</span>
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
          {t.otherLot.give}
        </button>
      </div>
    </section>
  );
}
