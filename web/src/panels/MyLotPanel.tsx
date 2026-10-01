// Panel "Mi lote" (docs/07-pantallas-y-flujos.md): nombre, color, edificio, construir o mejorar y pedir materiales.
import { useEffect, useState, type FormEvent } from 'react';
import { build, cancelRequest, recolorLot, renameLot, requestMaterials } from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadHelps, loadVisits } from '../api/reads';
import { useCity, type CitySnapshot } from '../store/city';
import { LOT_COLORS } from '../renderer/colors';
import {
  BUILDING_GLYPH,
  BUILDING_LABEL,
  MATERIAL_LABEL,
  formatHours,
  formatNumber,
  formatPercent,
  formatRemaining,
  plural,
} from '../game/format';
import { barrioAttractiveness, lotCapacity } from '../game/citizens';
import { effectiveRate, materialOf, producersOf, scarceMaterial } from '../game/production';
import { configOf, type BuildingType, type CityConfig, type Construction, type Inventory, type Lot, type Material } from '../types/game';
import { AttractivenessFactors } from './AttractivenessFactors';

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
        <p className="muted">Tu lote{barrio ? ` · ${barrio.name}` : ''}</p>
        <LotColor lot={lot} palette={cfg.palette} />
      </section>
      {lot.level > 0 && <Building lot={lot} snapshot={snapshot} cfg={cfg} />}
      {construction ? (
        <InProgress construction={construction} names={names} />
      ) : lot.level < 3 ? (
        <BuildForm lot={lot} snapshot={snapshot} cfg={cfg} inventory={inventory} jornadas={me.jornadas} names={names} />
      ) : (
        <section>
          <p>Tu edificio ya está al máximo.</p>
        </section>
      )}
      <RequestSection lot={lot} cfg={cfg} inventory={inventory} building={construction !== null} />
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
        <button type="button" className="link" title="Cambiar el nombre" onClick={() => setDraft(lot.name ?? '')}>
          {lot.name} <span className="edit" aria-hidden="true">✎</span>
        </button>
      </h2>
    );
  }

  return (
    <form className="rename" onSubmit={save}>
      <input
        aria-label="Nombre del lote"
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
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          Guardar
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
      <div className="swatches" role="radiogroup" aria-label="Color del lote">
        {palette.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={c === lot.color}
            aria-label={c}
            title={c}
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
  const parts = [`${formatNumber(rate.base)}/h base`];
  if (rate.plazaBonus > 0) {
    const plazas = Math.round(rate.plazaBonus / cfg.production.plaza_bonus);
    parts.push(`+${formatPercent(rate.plazaBonus)} ${plazas > 1 ? 'plazas vecinas' : 'plaza vecina'}`);
  }
  if (rate.workBonus > 0) parts.push(`+${formatPercent(rate.workBonus)} ${work?.name ?? 'obra del barrio'}`);
  if (rate.stateFactor !== 1) parts.push(`−${formatPercent(1 - rate.stateFactor)} ${lot.state}`);
  if (residential && rate.stateFactor > 0) parts.push(`× ${formatPercent(rate.attractiveness)} de atractivo`);

  return (
    <section>
      <h3>
        <span className="glyph">{BUILDING_GLYPH[type]}</span> {BUILDING_LABEL[type]} · nivel {lot.level}
      </h3>
      {rate.material ? (
        <>
          <p className="rate">
            {formatNumber(rate.total)} de {MATERIAL_LABEL[rate.material]} por hora{residential && ' de alquiler'}
          </p>
          <p className="muted">{parts.join(' · ')}</p>
        </>
      ) : (
        <p className="muted">
          La plaza no produce: suma +{formatPercent(cfg.production.plaza_bonus)} a cada lote pegado.
        </p>
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
      <p>Aloja {plural(lotCapacity(lot, cfg), 'ciudadano', 'ciudadanos')}.</p>
      <p className="label">Atractivo del barrio: {formatPercent(attractiveness.value)}</p>
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
          <h3>¿Qué construís?</h3>
          <p>
            En tu barrio escasea:{' '}
            <strong>
              {
                MATERIAL_LABEL[
                  scarceMaterial(lot.barrio_id, snapshot.lots, snapshot.works, snapshot.barrios, snapshot.constructions, cfg)
                ]
              }
            </strong>
          </p>
          <div className="types" role="radiogroup" aria-label="Tipo de edificio">
            {cfg.buildings.types.map((t) => {
              const produces = cfg.buildings.produces[t];
              return (
                <button
                  type="button"
                  key={t}
                  role="radio"
                  aria-checked={t === picked}
                  className={t === picked ? 'type on' : 'type'}
                  onClick={() => setPicked(t)}
                >
                  <span>
                    <span className="glyph">{BUILDING_GLYPH[t]}</span> {BUILDING_LABEL[t]}
                  </span>
                  <small>
                    {produces
                      ? `produce ${MATERIAL_LABEL[produces]}`
                      : t === 'residencial'
                        ? `aloja ${cfg.residential.capacity_by_level['1']} y cobra alquiler`
                        : `+${formatPercent(cfg.production.plaza_bonus)} a los vecinos`}
                  </small>
                </button>
              );
            })}
          </div>
          {needsRent && <RentPicker lot={lot} snapshot={snapshot} cfg={cfg} rent={rent} onPick={setRent} />}
        </>
      ) : (
        <>
          <h3>Mejorar a nivel {target}</h3>
          {lot.building_type === 'residencial' && (
            <p className="muted">
              Va a alojar {plural(cfg.residential.capacity_by_level[String(target)] ?? 0, 'ciudadano', 'ciudadanos')}.
            </p>
          )}
        </>
      )}

      <p className="label">Cuesta</p>
      <ul className="cost">
        {needed.map((m) => (
          <li key={m} className={have(m) < next.cost[m] ? 'short' : undefined}>
            {next.cost[m]} de {MATERIAL_LABEL[m]}
            {have(m) < next.cost[m] && ` · te faltan ${next.cost[m] - have(m)}`}
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
          {first ? 'Construir' : 'Mejorar'} (1 jornada, {formatHours(next.hours)})
        </button>
      </div>

      {toAsk.length > 0 && (
        <div className="ask">
          <p className="label">Pediles a tus vecinos</p>
          <ul>
            {toAsk.map((m) => {
              const producers = producersOf(m, lot.barrio_id, snapshot.lots, cfg, lot.owner_id ?? '');
              return (
                <li key={m}>
                  <strong>{MATERIAL_LABEL[m]}:</strong>{' '}
                  {producers.length
                    ? producers.map((l) => names.get(l.owner_id ?? '') ?? l.name).join(', ')
                    : 'nadie produce todavía en tu barrio'}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// Pedir materiales: queda como burbuja sobre el lote hasta que los regalos lo cubren o se quita.
// Sin pedido abierto, propone lo que falta para el próximo nivel (si no hay obra en curso).
function RequestSection(props: { lot: Lot; cfg: CityConfig; inventory: Inventory | null; building: boolean }) {
  const { lot, cfg, inventory, building } = props;
  const { min_amount: min, max_amount: max } = cfg.request;
  const next = !building && lot.level < 3 ? cfg.buildings.levels[String(lot.level + 1)] : null;
  const short = (m: Material) => (next ? Math.max(0, next.cost[m] - (inventory?.[m] ?? 0)) : 0);
  const own = lot.level > 0 ? materialOf(lot, cfg) : null;
  const suggested = cfg.materials.types.find((m) => m !== own && short(m) > 0) ?? null;
  const [material, setMaterial] = useState<Material>(suggested ?? cfg.materials.types[0]);
  const [amount, setAmount] = useState(Math.min(max, Math.max(min, suggested ? short(suggested) : min)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (lot.request_material && lot.request_amount !== null) {
    const left = lot.request_amount - lot.request_received;
    return (
      <section>
        <h3>Tu pedido</h3>
        <p>
          {lot.request_amount} de {MATERIAL_LABEL[lot.request_material]}
          {lot.request_received > 0 && ` · recibiste ${lot.request_received}, faltan ${left}`}
        </p>
        <div className="bar">
          <span style={{ width: `${(lot.request_received / lot.request_amount) * 100}%` }} />
        </div>
        <p className="muted">Tus vecinos lo ven en el mapa. Se borra solo cuando te regalan lo que pediste.</p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="secondary" disabled={busy} onClick={() => run(cancelRequest)}>
            Quitar pedido
          </button>
        </div>
      </section>
    );
  }

  const valid = amount >= min && amount <= max;
  return (
    <section>
      <h3>Pedir materiales</h3>
      <div className="types three" role="radiogroup" aria-label="Material a pedir">
        {cfg.materials.types.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={m === material}
            className={m === material ? 'type on' : 'type'}
            onClick={() => {
              setMaterial(m);
              if (short(m) > 0) setAmount(Math.min(max, Math.max(min, short(m))));
            }}
          >
            <span>{MATERIAL_LABEL[m]}</span>
            {short(m) > 0 && <small>te faltan {short(m)}</small>}
          </button>
        ))}
      </div>
      <label className="amount">
        <span>Cantidad</span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      </label>
      {!valid && <p className="error">Pedí entre {min} y {max} unidades.</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || !valid}
          onClick={() => run(() => requestMaterials(material, amount))}
        >
          Pedir
        </button>
      </div>
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
      <p className="label">¿Qué vas a cobrar de alquiler?</p>
      <div className="types" role="radiogroup" aria-label="Material del alquiler">
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
        Aloja {cfg.residential.capacity_by_level['1']} ciudadanos. El alquiler rinde según el atractivo del barrio: hoy{' '}
        {formatPercent(rate.attractiveness)}, unos {formatNumber(rate.total)} por hora.
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
      <h3>
        En obra: {BUILDING_LABEL[construction.building_type]} nivel {construction.target_level}
      </h3>
      <div className="bar">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="rate">{left > 0 ? `Faltan ${formatRemaining(left)}` : 'Terminando: en unos minutos sube de nivel.'}</p>
      {helpers && (
        <p className="muted">
          {helpers.length
            ? `Ayudaron: ${helpers.map((id) => names.get(id) ?? 'alguien').join(', ')}`
            : 'Todavía no ayudó nadie.'}
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
      <h3>Quién pasó por acá</h3>
      {visitors.length === 0 ? (
        <p className="muted">Nadie pasó en los últimos {VISIT_DAYS} días.</p>
      ) : (
        <p>
          {visitors.map((id) => names.get(id) ?? 'alguien').join(', ')}{' '}
          <span className="muted">· {plural(visitors.length, 'vecino', 'vecinos')} en {VISIT_DAYS} días</span>
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
