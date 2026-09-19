import { useEffect, useMemo, useState } from 'react';
import { heartbeat } from '../api/actions';
import { connectCity } from '../api/live';
import { refreshCity } from '../api/sync';
import { messageOf } from '../api/errors';
import { useCity } from '../store/city';
import { CityCanvas } from '../renderer/CityCanvas';
import type { Scene } from '../renderer/draw';
import { MyLotPanel } from '../panels/MyLotPanel';
import { OtherLotPanel } from '../panels/OtherLotPanel';
import { WorkPanel } from '../panels/WorkPanel';
import { BarrioPanel } from '../panels/BarrioPanel';
import { gridSize, workPercent, type Cell } from '../game/geo';
import { MATERIAL_LABEL } from '../game/format';
import { configOf, type Inventory, type Material } from '../types/game';
import { Notice } from '../App';

// Qué muestra el panel lateral. 'mine' es el estado de reposo.
type Selection =
  | { kind: 'mine' }
  | { kind: 'lot'; id: string }
  | { kind: 'work'; id: string }
  | { kind: 'barrio'; id: string };

// /city solo para quien tiene sesión y lote.
export function CityGate() {
  const session = useCity((s) => s.session);
  const me = useCity((s) => s.me);
  const meReady = useCity((s) => s.meReady);
  if (!session) return <Notice>Para entrar a Ciudad Común necesitás el link de una invitación.</Notice>;
  if (!meReady) return <Notice>Cargando…</Notice>;
  if (!me) return <Notice>Todavía no tenés lote. Abrí el link de tu invitación para fundar el tuyo.</Notice>;
  return <CityScreen />;
}

function CityScreen() {
  const snapshot = useCity((s) => s.snapshot);
  const me = useCity((s) => s.me)!;
  const inventory = useCity((s) => s.inventory);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'mine' });
  const backToMine = () => setSelection({ kind: 'mine' });

  // Carga inicial y después Realtime (o polling si Realtime no anda).
  useEffect(() => {
    refreshCity().catch((e) => setError(messageOf(e)));
    return connectCity();
  }, []);

  // Producción perezosa: el latido recoge lo producido al abrir y cada vez que la pestaña vuelve a verse.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') heartbeat().catch(() => {});
    };
    beat();
    document.addEventListener('visibilitychange', beat);
    return () => document.removeEventListener('visibilitychange', beat);
  }, []);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const { lots, works, barrios, constructions, players, city } = snapshot;
    const myLot = lots.find((l) => l.owner_id === me.id) ?? null;
    const names = new Map(players.map((p) => [p.id, p.display_name]));

    const tooltip = (cell: Cell) => {
      const work = works.find((w) => w.x === cell.x && w.y === cell.y);
      if (work) return `${work.name} · ${workPercent(work)} %`;
      const lot = lots.find((l) => l.x === cell.x && l.y === cell.y);
      if (!lot || lot.status === 'cerrado') return null;
      if (lot.status === 'libre') return 'Lote libre';
      return `${lot.name} · ${names.get(lot.owner_id ?? '') ?? ''}`;
    };

    // Un toque abre el panel de lo que haya en la celda; en una calle o un lote libre vuelve a mi lote.
    const click = (cell: Cell) => {
      const work = works.find((w) => w.x === cell.x && w.y === cell.y);
      if (work) return setSelection({ kind: 'work', id: work.id });
      const lot = lots.find((l) => l.x === cell.x && l.y === cell.y);
      if (lot?.status === 'ocupado') {
        return setSelection(lot.owner_id === me.id ? { kind: 'mine' } : { kind: 'lot', id: lot.id });
      }
      backToMine();
    };

    const barrio = barrios.find((b) => b.id === myLot?.barrio_id) ?? barrios[0];
    const barrioLots = lots.filter((l) => l.barrio_id === barrio.id);
    const work = works.find((w) => w.barrio_id === barrio.id);
    const footer = [
      barrio.name,
      `${barrioLots.filter((l) => l.status === 'ocupado').length}/${barrioLots.length}`,
      work ? `${work.name} ${workPercent(work)} %` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const scene: Scene = {
      ...gridSize(lots, works),
      lots,
      works,
      barrios,
      constructions,
      timezone: city.timezone,
      myLotId: myLot?.id,
      selectedLotId: selection.kind === 'lot' ? selection.id : null,
      selectedWorkId: selection.kind === 'work' ? selection.id : null,
    };

    return { scene, tooltip, click, footer, myLot, barrio, cap: configOf(city).jornadas.cap };
  }, [snapshot, me.id, selection]);

  if (error) return <Notice>{error}</Notice>;
  if (!view) return <Notice>Cargando la ciudad…</Notice>;

  return (
    <div className="city">
      <header className="topbar">
        <Jornadas value={me.jornadas} cap={view.cap} />
        {inventory && <Materials inventory={inventory} />}
      </header>
      <main className="map">
        <CityCanvas scene={view.scene} tooltip={view.tooltip} onCellClick={view.click} />
      </main>
      <button type="button" className="mapfoot" onClick={() => setSelection({ kind: 'barrio', id: view.barrio.id })}>
        {view.footer} <span className="muted">· qué falta</span>
      </button>
      <Panel selection={selection} onBack={backToMine} onSelect={setSelection} myLotId={view.myLot?.id ?? null} />
    </div>
  );
}

// Elige el panel según la selección. Si lo elegido ya no está (una obra que se completó,
// un lote que cambió), vuelve al panel de mi lote.
function Panel(props: {
  selection: Selection;
  onBack: () => void;
  onSelect: (s: Selection) => void;
  myLotId: string | null;
}) {
  const { selection, onBack, onSelect, myLotId } = props;
  const snapshot = useCity((s) => s.snapshot)!;

  if (selection.kind === 'lot') {
    const lot = snapshot.lots.find((l) => l.id === selection.id);
    if (lot && lot.status === 'ocupado' && lot.id !== myLotId) return <OtherLotPanel lot={lot} onBack={onBack} />;
  }
  if (selection.kind === 'work') {
    const work = snapshot.works.find((w) => w.id === selection.id);
    if (work) return <WorkPanel work={work} onBack={onBack} />;
  }
  if (selection.kind === 'barrio') {
    const barrio = snapshot.barrios.find((b) => b.id === selection.id);
    if (barrio) {
      return <BarrioPanel barrio={barrio} onBack={onBack} onOpenWork={(id) => onSelect({ kind: 'work', id })} />;
    }
  }
  const myLot = snapshot.lots.find((l) => l.id === myLotId);
  return myLot ? <MyLotPanel lot={myLot} /> : null;
}

function Jornadas({ value, cap }: { value: number; cap: number }) {
  return (
    <span className="jornadas" title={`${value} de ${cap} jornadas`}>
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={i < value ? 'dot on' : 'dot'} />
      ))}
      <span>
        {value} {value === 1 ? 'jornada' : 'jornadas'}
      </span>
    </span>
  );
}

function Materials({ inventory }: { inventory: Inventory }) {
  const items: Material[] = ['ladrillo', 'madera', 'energia'];
  return (
    <span className="materials">
      {items.map((m) => (
        <span key={m}>
          ▪ {inventory[m]} {MATERIAL_LABEL[m]}
        </span>
      ))}
    </span>
  );
}
