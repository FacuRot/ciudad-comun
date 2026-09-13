import { useEffect, useMemo, useState } from 'react';
import { loadCity } from '../api/reads';
import { messageOf } from '../api/errors';
import { useCity } from '../store/city';
import { CityCanvas } from '../renderer/CityCanvas';
import type { Scene } from '../renderer/draw';
import { MyLotPanel } from '../panels/MyLotPanel';
import { gridSize, workPercent, type Cell } from '../game/geo';
import { MATERIAL_LABEL } from '../game/format';
import { configOf, type Inventory, type Material } from '../types/game';
import { Notice } from '../App';

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
  const setSnapshot = useCity((s) => s.setSnapshot);
  const me = useCity((s) => s.me)!;
  const inventory = useCity((s) => s.inventory);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCity()
      .then(setSnapshot)
      .catch((e) => setError(messageOf(e)));
  }, [setSnapshot]);

  const view = useMemo(() => {
    if (!snapshot) return null;
    const { lots, works, barrios, constructions, players, city } = snapshot;
    const myLot = lots.find((l) => l.owner_id === me.id) ?? null;
    const scene: Scene = {
      ...gridSize(lots, works),
      lots,
      works,
      barrios,
      constructions,
      timezone: city.timezone,
      myLotId: myLot?.id,
    };
    const names = new Map(players.map((p) => [p.id, p.display_name]));

    const tooltip = (cell: Cell) => {
      const work = works.find((w) => w.x === cell.x && w.y === cell.y);
      if (work) return `${work.name} · ${workPercent(work)} %`;
      const lot = lots.find((l) => l.x === cell.x && l.y === cell.y);
      if (!lot || lot.status === 'cerrado') return null;
      if (lot.status === 'libre') return 'Lote libre';
      return `${lot.name} · ${names.get(lot.owner_id ?? '') ?? ''}`;
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

    return { scene, tooltip, footer, myLot, cap: configOf(city).jornadas.cap };
  }, [snapshot, me.id]);

  if (error) return <Notice>{error}</Notice>;
  if (!view) return <Notice>Cargando la ciudad…</Notice>;

  return (
    <div className="city">
      <header className="topbar">
        <Jornadas value={me.jornadas} cap={view.cap} />
        {inventory && <Materials inventory={inventory} />}
      </header>
      <main className="map">
        <CityCanvas scene={view.scene} tooltip={view.tooltip} />
      </main>
      <footer className="mapfoot">{view.footer}</footer>
      {view.myLot && <MyLotPanel lot={view.myLot} />}
    </div>
  );
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
