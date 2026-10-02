import { useEffect, useMemo, useState } from 'react';
import { getSummary, heartbeat } from '../api/actions';
import { connectCity } from '../api/live';
import { refreshCity } from '../api/sync';
import { messageOf } from '../api/errors';
import { useCity } from '../store/city';
import { navigate } from '../router';
import { CityCanvas } from '../renderer/CityCanvas';
import type { Scene } from '../renderer/draw';
import { MyLotPanel } from '../panels/MyLotPanel';
import { OtherLotPanel } from '../panels/OtherLotPanel';
import { WorkPanel } from '../panels/WorkPanel';
import { BarrioPanel } from '../panels/BarrioPanel';
import { SummaryModal, type Collected } from '../panels/SummaryModal';
import { streetsLevel, streetsState } from '../game/streets';
import { InviteModal } from '../panels/InviteModal';
import { Toasts } from '../panels/Toasts';
import { gridSize, workPercent, type Cell } from '../game/geo';
import { MATERIAL_LABEL } from '../game/format';
import { configOf, type GameEvent, type Inventory, type MapRequest, type Material } from '../types/game';
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
  useEffect(() => {
    if (!session) navigate('/entrar', true);
  }, [session]);
  if (!session || !meReady) return <Notice>Cargando…</Notice>;
  if (!me) return <Notice>Todavía no tenés lote. Abrí el link de tu invitación para fundar el tuyo.</Notice>;
  return <CityScreen />;
}

function CityScreen() {
  const snapshot = useCity((s) => s.snapshot);
  const me = useCity((s) => s.me)!;
  const inventory = useCity((s) => s.inventory);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'mine' });
  const [summary, setSummary] = useState<{ events: GameEvent[]; collected: Collected } | null>(null);
  const [inviting, setInviting] = useState(false);
  const backToMine = () => setSelection({ kind: 'mine' });

  // Carga inicial y después Realtime (o polling si Realtime no anda).
  useEffect(() => {
    refreshCity().catch((e) => setError(messageOf(e)));
    return connectCity();
  }, []);

  // Producción perezosa: el latido recoge lo producido al abrir y cada vez que la pestaña vuelve a verse.
  // Si estuvo bastante rato afuera, además trae el resumen de lo que pasó.
  useEffect(() => {
    const beat = async () => {
      if (document.visibilityState !== 'visible') return;
      const pulse = await heartbeat();
      if (!pulse.show_summary) return;
      const events = await getSummary(pulse.since);
      setSummary({ events, collected: pulse.collected });
    };
    const run = () => {
      beat().catch(() => {});
    };
    run();
    document.addEventListener('visibilitychange', run);
    return () => document.removeEventListener('visibilitychange', run);
  }, []);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const { lots, works, barrios, constructions, players, city } = snapshot;
    const myLot = lots.find((l) => l.owner_id === me.id) ?? null;
    const names = new Map(players.map((p) => [p.id, p.display_name]));

    // Pedidos abiertos: cuánto le falta recibir a cada lote, para la burbuja y el tooltip.
    const requests = new Map<string, MapRequest>();
    for (const l of lots) {
      if (l.request_material && l.request_amount !== null) {
        requests.set(l.id, { material: l.request_material, left: l.request_amount - l.request_received });
      }
    }

    const tooltip = (cell: Cell) => {
      const work = works.find((w) => w.x === cell.x && w.y === cell.y);
      if (work) return `${work.name} · ${workPercent(work)} %`;
      const lot = lots.find((l) => l.x === cell.x && l.y === cell.y);
      if (!lot || lot.status === 'cerrado') return null;
      if (lot.status === 'libre') return 'Lote libre';
      const base = `${lot.name} · ${names.get(lot.owner_id ?? '') ?? ''}`;
      const request = requests.get(lot.id);
      return request ? `${base} · pide ${request.left} de ${MATERIAL_LABEL[request.material]}` : base;
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

    // El rango de las calles de ahora, para dibujarlas (docs/05 §18). Se recalcula con cada
    // cambio de la ciudad: el desgaste es lento y solo se ve al cruzar un rango.
    const cfg = configOf(city);
    const scene: Scene = {
      ...gridSize(lots, works),
      lots,
      works,
      barrios: barrios.map((b) => ({ ...b, streets: streetsLevel(streetsState(b, cfg), cfg.streets) })),
      constructions,
      requests,
      timezone: city.timezone,
      myLotId: myLot?.id,
      selectedLotId: selection.kind === 'lot' ? selection.id : null,
      selectedWorkId: selection.kind === 'work' ? selection.id : null,
    };

    return { scene, tooltip, click, footer, myLot, barrio, cap: cfg.jornadas.cap };
  }, [snapshot, me.id, selection]);

  if (error) return <Notice>{error}</Notice>;
  if (!view) return <Notice>Cargando la ciudad…</Notice>;

  return (
    <div className="city">
      <header className="topbar">
        <Jornadas value={me.jornadas} cap={view.cap} />
        {inventory && <Materials inventory={inventory} />}
        <button type="button" className="secondary invite" onClick={() => setInviting(true)}>
          Invitar
        </button>
      </header>
      <main className="map">
        <CityCanvas scene={view.scene} tooltip={view.tooltip} onCellClick={view.click} />
      </main>
      <button type="button" className="mapfoot" onClick={() => setSelection({ kind: 'barrio', id: view.barrio.id })}>
        {view.footer} <span className="muted">· qué falta</span>
      </button>
      <Panel selection={selection} onBack={backToMine} onSelect={setSelection} myLotId={view.myLot?.id ?? null} />
      <Toasts />
      {summary && (
        <SummaryModal events={summary.events} collected={summary.collected} onClose={() => setSummary(null)} />
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
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
