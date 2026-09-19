// Panel de barrio (docs/07-pantallas-y-flujos.md): qué se produce, qué edificios hay y qué falta.
import { useCity } from '../store/city';
import { workPercent } from '../game/geo';
import { effectiveRate, scarceMaterial } from '../game/production';
import { BUILDING_COUNT, BUILDING_GLYPH, MATERIAL_LABEL, formatNumber, plural } from '../game/format';
import { configOf, type Barrio, type Material } from '../types/game';
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
  const { lots, works, constructions } = snapshot;

  const mine = lots.filter((l) => l.barrio_id === barrio.id);
  const taken = mine.filter((l) => l.status === 'ocupado');
  const free = mine.filter((l) => l.status === 'libre');
  const work = works.find((w) => w.barrio_id === barrio.id) ?? null;

  // Producción por hora del barrio entero, con la misma cuenta que usa el servidor.
  const production = new Map<Material, number>(cfg.materials.types.map((m) => [m, 0]));
  for (const lot of taken) {
    const rate = effectiveRate(lot, lots, works, cfg);
    if (rate.material) production.set(rate.material, production.get(rate.material)! + rate.total);
  }

  const byType = cfg.buildings.types.map((t) => ({
    type: t,
    count: taken.filter((l) => l.building_type === t && l.level > 0).length,
  }));
  const empty = taken.filter((l) => l.level === 0).length;
  const scarce = scarceMaterial(barrio.id, lots, works, constructions, cfg);

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
            {work.status === 'completada' ? 'Terminada: el barrio produce más.' : `${workPercent(work)} % construida`}
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
