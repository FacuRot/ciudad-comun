// Panel "Mi lote" (docs/07-pantallas-y-flujos.md): nombre, color, edificio y construir o mejorar.
import { useEffect, useState, type FormEvent } from 'react';
import { build, recolorLot, renameLot } from '../api/actions';
import { GameError, messageOf } from '../api/errors';
import { loadHelps } from '../api/reads';
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
} from '../game/format';
import { effectiveRate, producersOf, scarceMaterial } from '../game/production';
import { configOf, type BuildingType, type CityConfig, type Construction, type Inventory, type Lot, type Material } from '../types/game';

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
function Building({ lot, snapshot, cfg }: { lot: Lot; snapshot: CitySnapshot; cfg: CityConfig }) {
  const type = lot.building_type!;
  const rate = effectiveRate(lot, snapshot.lots, snapshot.works, cfg);
  const work = snapshot.works.find((w) => w.barrio_id === lot.barrio_id);
  const parts = [`${formatNumber(rate.base)}/h base`];
  if (rate.plazaBonus > 0) {
    const plazas = Math.round(rate.plazaBonus / cfg.production.plaza_bonus);
    parts.push(`+${formatPercent(rate.plazaBonus)} ${plazas > 1 ? 'plazas vecinas' : 'plaza vecina'}`);
  }
  if (rate.workBonus > 0) parts.push(`+${formatPercent(rate.workBonus)} ${work?.name ?? 'obra del barrio'}`);
  if (rate.stateFactor !== 1) parts.push(`−${formatPercent(1 - rate.stateFactor)} ${lot.state}`);

  return (
    <section>
      <h3>
        <span className="glyph">{BUILDING_GLYPH[type]}</span> {BUILDING_LABEL[type]} · nivel {lot.level}
      </h3>
      {rate.material ? (
        <>
          <p className="rate">
            {formatNumber(rate.total)} de {MATERIAL_LABEL[rate.material]} por hora
          </p>
          <p className="muted">{parts.join(' · ')}</p>
        </>
      ) : (
        <p className="muted">
          La plaza no produce: suma +{formatPercent(cfg.production.plaza_bonus)} a cada lote pegado.
        </p>
      )}
    </section>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const first = lot.level === 0;
  const target = lot.level + 1;
  const next = cfg.buildings.levels[String(target)];
  const type = lot.building_type ?? picked;
  const have = (m: Material) => inventory?.[m] ?? 0;
  const needed = cfg.materials.types.filter((m) => next.cost[m] > 0);
  const missing = needed.filter((m) => have(m) < next.cost[m]);

  const submit = async () => {
    if (!type) return;
    setBusy(true);
    setError(null);
    try {
      await build(type); // al aparecer la construcción, este formulario se desmonta
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
              {MATERIAL_LABEL[scarceMaterial(lot.barrio_id, snapshot.lots, snapshot.works, snapshot.constructions, cfg)]}
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
                      : `+${formatPercent(cfg.production.plaza_bonus)} a los vecinos`}
                  </small>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <h3>Mejorar a nivel {target}</h3>
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
          disabled={busy || !type || missing.length > 0 || jornadas < 1}
          onClick={submit}
        >
          {first ? 'Construir' : 'Mejorar'} (1 jornada, {formatHours(next.hours)})
        </button>
      </div>

      {missing.length > 0 && (
        <div className="ask">
          <p className="label">Pediles a tus vecinos</p>
          <ul>
            {missing.map((m) => {
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

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
