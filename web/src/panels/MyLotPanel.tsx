// Panel "Mi lote" (docs/07-pantallas-y-flujos.md): nombre, color, edificio y construir o mejorar.
import { useEffect, useState, type FormEvent } from 'react';
import { build, recolorLot, renameLot } from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadHelps, loadVisits } from '../api/reads';
import { useCity, type CitySnapshot } from '../store/city';
import { LOT_COLORS } from '../renderer/colors';
import {
  BUILDING_GLYPH,
  BUILDING_LABEL,
  MATERIAL_LABEL,
  colorLabel,
  formatHours,
  formatNumber,
  formatPercent,
  formatRemaining,
} from '../game/format';
import { barrioAttractiveness, lotCapacity } from '../game/citizens';
import { effectiveRate, materialOf, producersOf, scarceMaterial } from '../game/production';
import { configOf, type BuildingType, type CityConfig, type Construction, type Inventory, type Lot, type Material } from '../types/game';
import { AttractivenessFactors } from './AttractivenessFactors';
import { t } from '../i18n';

type Names = Map<string, string>;

export function MyLotPanel({ lot }: { lot: Lot }) {
  const snapshot = useCity((s) => s.snapshot)!;
  const me = useCity((s) => s.me)!;
  const inventory = useCity((s) => s.inventory);
  const cfg = configOf(snapshot.city);
  const barrio = snapshot.barrios.find((b) => b.id === lot.barrio_id);
  const construction = snapshot.constructions.find((c) => c.lot_id === lot.id) ?? null;
  const names: Names = new Map(snapshot.players.map((p) => [p.id, p.display_name]));

  return (
    <aside className="panel">
      <section>
        <LotName lot={lot} />
        <p className="muted">
          {t.myLot.yourLot}
          {barrio ? ` · ${barrio.name}` : ''}
        </p>
        <LotColor lot={lot} palette={cfg.palette} />
      </section>
      {lot.level > 0 && <Building lot={lot} snapshot={snapshot} cfg={cfg} />}
      {construction ? (
        <InProgress construction={construction} names={names} />
      ) : lot.level < 3 ? (
        <BuildForm lot={lot} snapshot={snapshot} cfg={cfg} inventory={inventory} jornadas={me.jornadas} names={names} />
      ) : (
        <section>
          <p>{t.myLot.maxed}</p>
        </section>
      )}
      <Visits lotId={lot.id} names={names} />
    </aside>
  );
}

function LotName({ lot }: { lot: Lot }) {
  const [draft, setDraft] = useState<string | null>(null); // null: no se está editando
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDraft(null);
    setError(null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const name = (draft ?? '').trim();
    if (name === lot.name) {
      close();
      return;
    }
    if (name.length < 2 || name.length > 24) {
      setError(new GameError('NAME_LENGTH').message);
      return;
    }
    setBusy(true);
    try {
      await renameLot(name);
      close();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (draft === null) {
    return (
      <h2 className="lotname">
        <button type="button" className="link" title={t.myLot.rename} onClick={() => setDraft(lot.name ?? '')}>
          {lot.name} <span className="edit" aria-hidden="true">✎</span>
        </button>
      </h2>
    );
  }

  return (
    <form className="rename" onSubmit={save}>
      <input
        aria-label={t.myLot.lotName}
        autoFocus
        maxLength={24}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="secondary" onClick={close} disabled={busy}>
          {t.common.cancel}
        </button>
        <button className="primary" disabled={busy}>
          {t.common.save}
        </button>
      </div>
    </form>
  );
}

function LotColor({ lot, palette }: { lot: Lot; palette: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (color: string) => {
    if (color === lot.color || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recolorLot(color);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="swatches" role="radiogroup" aria-label={t.myLot.lotColor}>
        {palette.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={c === lot.color}
            aria-label={colorLabel(c)}
            title={colorLabel(c)}
            className={c === lot.color ? 'swatch on' : 'swatch'}
            style={{ background: LOT_COLORS[c] }}
            onClick={() => pick(c)}
          />
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

// Edificio actual y su tasa efectiva con desglose ("2/h base · +10 % plaza vecina").
// El residencial muestra además cuántos aloja y el atractivo del que depende su alquiler.
function Building({ lot, snapshot, cfg }: { lot: Lot; snapshot: CitySnapshot; cfg: CityConfig }) {
  const type = lot.building_type!;
  const rate = effectiveRate(lot, snapshot.lots, snapshot.works, snapshot.barrios, cfg);
  const work = snapshot.works.find((w) => w.barrio_id === lot.barrio_id);
  const residential = type === 'residencial';
  const parts = [t.myLot.base(formatNumber(rate.base))];
  if (rate.plazaBonus > 0) {
    const plazas = Math.round(rate.plazaBonus / cfg.production.plaza_bonus);
    parts.push(t.myLot.plazaBonus(formatPercent(rate.plazaBonus), plazas > 1));
  }
  if (rate.workBonus > 0) parts.push(`+${formatPercent(rate.workBonus)} ${work?.name ?? t.myLot.workBonus}`);
  if (rate.stateFactor !== 1) parts.push(t.myLot.stateLoss(formatPercent(1 - rate.stateFactor), t.lotState[lot.state]));
  if (residential && rate.stateFactor > 0) parts.push(t.myLot.appealFactor(formatPercent(rate.attractiveness)));

  return (
    <section>
      <h3>
        <span className="glyph">{BUILDING_GLYPH[type]}</span> {BUILDING_LABEL[type]} · {t.common.level(lot.level)}
      </h3>
      {rate.material ? (
        <>
          <p className="rate">{t.myLot.rate(formatNumber(rate.total), MATERIAL_LABEL[rate.material], residential)}</p>
          <p className="muted">{parts.join(' · ')}</p>
        </>
      ) : (
        <p className="muted">{t.myLot.plazaInfo(formatPercent(cfg.production.plaza_bonus))}</p>
      )}
      {residential && <Rent lot={lot} snapshot={snapshot} cfg={cfg} />}
    </section>
  );
}

// Cuántos aloja el residencial y el atractivo del barrio, que es lo que mueve el alquiler (docs/05 §17.2).
function Rent({ lot, snapshot, cfg }: { lot: Lot; snapshot: CitySnapshot; cfg: CityConfig }) {
  const barrio = snapshot.barrios.find((b) => b.id === lot.barrio_id);
  if (!barrio) return null;
  const attractiveness = barrioAttractiveness(barrio, snapshot.lots, snapshot.works, cfg);
  const work = snapshot.works.find((w) => w.barrio_id === lot.barrio_id);
  return (
    <>
      <p>{t.myLot.houses(lotCapacity(lot, cfg))}</p>
      <p className="label">{t.myLot.appeal(formatPercent(attractiveness.value))}</p>
      <AttractivenessFactors attractiveness={attractiveness} workName={work?.name} />
    </>
  );
}

function BuildForm(props: {
  lot: Lot;
  snapshot: CitySnapshot;
  cfg: CityConfig;
  inventory: Inventory | null;
  jornadas: number;
  names: Names;
}) {
  const { lot, snapshot, cfg, inventory, jornadas, names } = props;
  const [picked, setPicked] = useState<BuildingType | null>(null);
  const [rent, setRent] = useState<Material | null>(null); // material del alquiler, si elige residencial
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = lot.level === 0;
  const target = lot.level + 1;
  const next = cfg.buildings.levels[String(target)];
  const type = lot.building_type ?? picked;
  const have = (m: Material) => inventory?.[m] ?? 0;
  const needed = cfg.materials.types.filter((m) => next.cost[m] > 0);
  const missing = needed.filter((m) => have(m) < next.cost[m]);
  // Lo que produce el propio lote (o cobra de alquiler) llega solo: a los vecinos se les pide el resto.
  const own = lot.level > 0 ? materialOf(lot, cfg) : null;
  const toAsk = missing.filter((m) => m !== own);
  // El nivel 1 de un residencial no se construye sin elegir el material del alquiler.
  const needsRent = first && type === 'residencial';

  const submit = async () => {
    if (!type || (needsRent && !rent)) return;
    setBusy(true);
    setError(null);
    try {
      await build(type, needsRent ? rent! : undefined); // al aparecer la construcción, este formulario se desmonta
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <section>
      {first ? (
        <>
          <h3>{t.myLot.whatBuild}</h3>
          <p>
            {t.myLot.scarce}{' '}
            <strong>
              {
                MATERIAL_LABEL[
                  scarceMaterial(lot.barrio_id, snapshot.lots, snapshot.works, snapshot.barrios, snapshot.constructions, cfg)
                ]
              }
            </strong>
          </p>
          <div className="types" role="radiogroup" aria-label={t.myLot.buildingType}>
            {cfg.buildings.types.map((bt) => {
              const produces = cfg.buildings.produces[bt];
              return (
                <button
                  type="button"
                  key={bt}
                  role="radio"
                  aria-checked={bt === picked}
                  className={bt === picked ? 'type on' : 'type'}
                  onClick={() => setPicked(bt)}
                >
                  <span>
                    <span className="glyph">{BUILDING_GLYPH[bt]}</span> {BUILDING_LABEL[bt]}
                  </span>
                  <small>
                    {produces
                      ? t.myLot.produces(MATERIAL_LABEL[produces])
                      : bt === 'residencial'
                        ? t.myLot.residentialHint(cfg.residential.capacity_by_level['1'])
                        : t.myLot.plazaHint(formatPercent(cfg.production.plaza_bonus))}
                  </small>
                </button>
              );
            })}
          </div>
          {needsRent && <RentPicker lot={lot} snapshot={snapshot} cfg={cfg} rent={rent} onPick={setRent} />}
        </>
      ) : (
        <>
          <h3>{t.myLot.upgradeTo(target)}</h3>
          {lot.building_type === 'residencial' && (
            <p className="muted">{t.myLot.willHouse(cfg.residential.capacity_by_level[String(target)] ?? 0)}</p>
          )}
        </>
      )}

      <p className="label">{t.myLot.cost}</p>
      <ul className="cost">
        {needed.map((m) => (
          <li key={m} className={have(m) < next.cost[m] ? 'short' : undefined}>
            {t.amountOf(next.cost[m], MATERIAL_LABEL[m])}
            {have(m) < next.cost[m] && t.myLot.short(next.cost[m] - have(m))}
          </li>
        ))}
      </ul>

      {jornadas < 1 && <p className="error">{new GameError('NO_JORNADAS').message}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || !type || (needsRent && !rent) || missing.length > 0 || jornadas < 1}
          onClick={submit}
        >
          {t.myLot.build(first, formatHours(next.hours))}
        </button>
      </div>

      {toAsk.length > 0 && (
        <div className="ask">
          <p className="label">{t.myLot.askNeighbors}</p>
          <ul>
            {toAsk.map((m) => {
              const producers = producersOf(m, lot.barrio_id, snapshot.lots, cfg, lot.owner_id ?? '');
              return (
                <li key={m}>
                  <strong>{MATERIAL_LABEL[m]}:</strong>{' '}
                  {producers.length
                    ? producers.map((l) => names.get(l.owner_id ?? '') ?? l.name).join(', ')
                    : t.myLot.nobodyProduces}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// "¿Qué vas a cobrar de alquiler?" (docs/07, panel Mi lote), con cuánto rendiría hoy.
function RentPicker(props: {
  lot: Lot;
  snapshot: CitySnapshot;
  cfg: CityConfig;
  rent: Material | null;
  onPick: (m: Material) => void;
}) {
  const { lot, snapshot, cfg, rent, onPick } = props;
  // El mismo lote con el residencial ya hecho: la tasa sale de la misma cuenta que usa el servidor.
  const built: Lot = { ...lot, building_type: 'residencial', level: 1, rent_material: rent ?? cfg.materials.types[0] };
  const rate = effectiveRate(built, snapshot.lots, snapshot.works, snapshot.barrios, cfg);

  return (
    <>
      <p className="label">{t.myLot.rentQuestion}</p>
      <div className="types" role="radiogroup" aria-label={t.myLot.rentMaterial}>
        {cfg.materials.types.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={m === rent}
            className={m === rent ? 'type on' : 'type'}
            onClick={() => onPick(m)}
          >
            <span>{MATERIAL_LABEL[m]}</span>
          </button>
        ))}
      </div>
      <p className="muted">
        {t.myLot.rentInfo(
          cfg.residential.capacity_by_level['1'],
          formatPercent(rate.attractiveness),
          formatNumber(rate.total),
        )}
      </p>
    </>
  );
}

// Construcción en curso: tiempo restante y quiénes ayudaron.
function InProgress({ construction, names }: { construction: Construction; names: Names }) {
  const now = useNow(10_000);
  const [helpers, setHelpers] = useState<string[] | null>(null);

  // Cada ayuda mueve ends_at: con eso alcanza para saber cuándo releer.
  useEffect(() => {
    let cancelled = false;
    loadHelps(construction.id)
      .then((rows) => !cancelled && setHelpers(rows.map((r) => r.helper_id)))
      .catch(() => !cancelled && setHelpers([]));
    return () => {
      cancelled = true;
    };
  }, [construction.id, construction.ends_at]);

  const start = Date.parse(construction.started_at);
  const end = Date.parse(construction.ends_at);
  const left = end - now;
  const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));

  return (
    <section>
      <h3>{t.common.underConstruction(BUILDING_LABEL[construction.building_type], construction.target_level)}</h3>
      <div className="bar">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="rate">{left > 0 ? t.common.left(formatRemaining(left)) : t.common.finishing}</p>
      {helpers && (
        <p className="muted">
          {helpers.length
            ? t.myLot.helpedBy(helpers.map((id) => names.get(id) ?? t.common.someoneLower).join(', '))
            : t.myLot.nobodyHelped}
        </p>
      )}
    </section>
  );
}

// "Quién pasó por acá": las visitas de la última semana (docs/07, panel Mi lote).
const VISIT_DAYS = 7;

function Visits({ lotId, names }: { lotId: string; names: Names }) {
  const [visitors, setVisitors] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadVisits(lotId, VISIT_DAYS)
      .then((rows) => {
        if (cancelled) return;
        const seen = new Set<string>();
        for (const r of rows) if (r.actor_id) seen.add(r.actor_id);
        setVisitors([...seen]);
      })
      .catch(() => !cancelled && setVisitors([]));
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  if (!visitors) return null;

  return (
    <section>
      <h3>{t.myLot.visitsTitle}</h3>
      {visitors.length === 0 ? (
        <p className="muted">{t.myLot.noVisits(VISIT_DAYS)}</p>
      ) : (
        <p>
          {visitors.map((id) => names.get(id) ?? t.common.someoneLower).join(', ')}{' '}
          <span className="muted">{t.myLot.visitors(visitors.length, VISIT_DAYS)}</span>
        </p>
      )}
    </section>
  );
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
