// Panel de barrio (docs/07-pantallas-y-flujos.md): qué se produce, qué edificios hay y qué falta,
// y lo colectivo: sus ciudadanos (docs/05 §16).
import { useCity } from '../store/city';
import { workPercent } from '../game/geo';
import { effectiveRate, scarceMaterial } from '../game/production';
import { barrioAttractiveness, barrioCapacity, populationTarget, populationTrend } from '../game/citizens';
import { BUILDING_COUNT, BUILDING_GLYPH, MATERIAL_LABEL, formatNumber, plural } from '../game/format';
import { configOf, type Barrio, type CityConfig, type Lot, type Material, type PublicWork } from '../types/game';
import { AttractivenessFactors } from './AttractivenessFactors';
import { PanelBack } from './PanelBack';

export function BarrioPanel({
  barrio,
  onBack,
  onOpenWork,
}: {
  barrio: Barrio;
  onBack: () => void;
  onOpenWork: (workId: string) => void;
}) {
  const snapshot = useCity((s) => s.snapshot)!;
  const cfg = configOf(snapshot.city);
  const { lots, works, barrios, constructions } = snapshot;

  const mine = lots.filter((l) => l.barrio_id === barrio.id);
  const taken = mine.filter((l) => l.status === 'ocupado');
  const free = mine.filter((l) => l.status === 'libre');
  const work = works.find((w) => w.barrio_id === barrio.id) ?? null;

  // Producción por hora del barrio entero, con la misma cuenta que usa el servidor.
  // Incluye el alquiler de los residenciales, que también es material que llega.
  const production = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  for (const lot of taken) {
    const rate = effectiveRate(lot, lots, works, barrios, cfg);
    if (rate.material) production.set(rate.material, production.get(rate.material)! + rate.total);
  }

  const byType = cfg.buildings.types.map((t) => ({
    type: t,
    count: taken.filter((l) => l.building_type === t && l.level > 0).length,
  }));
  const empty = taken.filter((l) => l.level === 0).length;
  const scarce = scarceMaterial(barrio.id, lots, works, barrios, constructions, cfg);

  return (
    <aside className="panel">
      <section>
        <PanelBack onBack={onBack} />
        <h2>{barrio.name}</h2>
        <p className="muted">
          {taken.length} de {mine.length} lotes ocupados
          {free.length > 0 && ` · ${plural(free.length, 'lote libre', 'lotes libres')}`}
        </p>
      </section>

      <Citizens barrio={barrio} lots={lots} works={works} cfg={cfg} />

      <section>
        <h3>Qué se produce por hora</h3>
        <ul className="cost">
          {cfg.materials.types.map((m) => (
            <li key={m} className={m === scarce ? 'short' : undefined}>
              {formatNumber(production.get(m)!)} de {MATERIAL_LABEL[m]}
              {m === scarce && ' · es lo que más escasea'}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Qué hay construido</h3>
        <ul className="cost">
          {byType.map(({ type, count }) => (
            <li key={type}>
              <span className="glyph">{BUILDING_GLYPH[type]}</span> {plural(count, ...BUILDING_COUNT[type])}
            </li>
          ))}
          {empty > 0 && <li className="muted">{plural(empty, 'lote sin edificio', 'lotes sin edificio')}</li>}
        </ul>
      </section>

      {work && (
        <section>
          <h3>{work.name}</h3>
          <div className="bar">
            <span style={{ width: `${workPercent(work)}%` }} />
          </div>
          <p className="muted">
            {work.status === 'completada' ? 'Obra terminada: el barrio produce más.' : `${workPercent(work)} % construida`}
          </p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => onOpenWork(work.id)}>
              Ver la obra
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}

const TREND = {
  1: { arrow: '↑', text: 'mañana llegan más' },
  0: { arrow: '', text: '' },
  [-1]: { arrow: '↓', text: 'mañana se va gente' },
} as const;

// Población, objetivo de hoy, capacidad y los cuatro factores del atractivo (docs/07, panel Barrio).
function Citizens({ barrio, lots, works, cfg }: { barrio: Barrio; lots: Lot[]; works: PublicWork[]; cfg: CityConfig }) {
  if (barrio.status !== 'abierto') {
    return (
      <section>
        <h3>Ciudadanos</h3>
        <p className="muted">Se abre pronto.</p>
      </section>
    );
  }

  const capacity = barrioCapacity(barrio.id, lots, cfg);
  const attractiveness = barrioAttractiveness(barrio, lots, works, cfg);
  const target = populationTarget(capacity, attractiveness.value);
  const trend = TREND[populationTrend(barrio.population, target)];
  const built = lots.filter((l) => l.barrio_id === barrio.id && l.level > 0);
  const residential = built.filter((l) => l.building_type === 'residencial').length;
  const others = built.length - residential;
  const work = works.find((w) => w.barrio_id === barrio.id);
  // "24 lotes con edificio y 2 residenciales": los residenciales van aparte porque alojan más.
  const housing = [
    others > 0 && plural(others, 'lote con edificio', 'lotes con edificio'),
    residential > 0 && plural(residential, 'residencial', 'residenciales'),
  ]
    .filter(Boolean)
    .join(' y ');

  return (
    <section>
      <h3>Ciudadanos</h3>
      <p className="citizens">
        <strong>{formatNumber(barrio.population)}</strong> de {formatNumber(target)} ciudadanos
        {trend.arrow && (
          <span className="trend" title={trend.text} aria-label={trend.text}>
            {' '}
            {trend.arrow}
          </span>
        )}
      </p>
      <p className="muted">
        {capacity > 0
          ? `Hay lugar para ${formatNumber(capacity)}: ${housing}.`
          : `Todavía no vive nadie: cada lote con edificio da lugar a ${cfg.citizens.capacity_per_lot}.`}
      </p>
      <AttractivenessFactors attractiveness={attractiveness} workName={work?.name} />
    </section>
  );
}
