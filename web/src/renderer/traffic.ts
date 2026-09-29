// Tránsito: unos pocos autos que cruzan la ciudad por las avenidas y gente que camina
// por las veredas. Muestra el juego pero no lo cambia: la gente de cada barrio sale de su
// población (docs/05 §16.5) y los autos esquivan las calles rotas (§18); fuera de eso solo
// lee dónde hay calle.
//
// Los autos van por las avenidas que atraviesan el tablero de punta a punta, por la
// mano derecha y sin doblar. En un cruce de avenidas pasa una sola por vez, y antes de
// una senda frenan si hay alguien cruzando. La gente camina por el medio de la vereda,
// dobla en las esquinas y cruza por las sendas cuando no viene ningún auto.
// Todo se mide en tiles, así el zoom no cambia nada; se pasa a píxeles al dibujar.
import type { Layout } from './layout';
import type { Scene } from './draw';
import { darken, lighten, mix } from './colors';
import { CURB, streetBarrios, streetsOf, ZEBRA, ZEBRA_DEPTH, ZEBRA_MID, type Streets } from './streets';
import { phaseAt, type Phase } from './time';
import { streetsLevel } from '../game/streets';

// Cuánto se llena la ciudad según la hora. De noche queda poca gente en la calle.
const SHARE: Record<Phase, number> = { dia: 1, atardecer: 0.75, noche: 0.4 };
// Uno cada tantos tiles de avenida o de vereda, con techo: la calle nunca se llena.
const TILES_PER_CAR = 5;
const TILES_PER_WALKER = 2;
const MAX_CARS = 5;
// La gente de un barrio: una persona cada tantos ciudadanos, con techo (docs/07, "El canvas").
const CITIZENS_PER_WALKER = 25;
const MAX_WALKERS_PER_BARRIO = 8;

const LANE_OFFSET = 0.165; // del eje de la calle al medio de cada mano
const CAR_GAP = 0.14; // entre paragolpes, en la fila
const WALKER_SIDE = 0.02; // la gente camina por su derecha: así se cruzan sin pisarse
const EXIT_REACH = 0.4; // cuánto siguen caminando fuera del tablero antes de irse
const FADE_S = 0.7;

const CAR_COLORS = ['#c4623f', '#3d6fb3', '#efe9dc', '#9aa0a3', '#4d5357', '#2b8a80', '#d09a2e', '#a8443a'];
const BUS_COLORS = ['#2b8a80', '#3d6fb3', '#c4623f', '#d09a2e'];
const TAXI_BODY = '#2c2a27';
const TAXI_ROOF = '#f2c12e';
const WINDSHIELD = '#5d7480';

const SHIRTS = ['#c4623f', '#d09a2e', '#7b8b3c', '#2b8a80', '#3d6fb3', '#8e76bf', '#d0749a', '#f1ece0', '#4f5559'];
const PANTS = ['#3e4a5c', '#4a4640', '#6b5a48', '#2f3a4a', '#8a7f6c'];
const SKINS = ['#f2cfae', '#e0b08a', '#c68e64', '#9c6a45', '#6f4a31'];
const HAIR = ['#2b211b', '#5a3d27', '#8c6239', '#c9a063', '#b9b4ab', '#1c1a18'];

type Axis = 'h' | 'v';

// Cruce de dos avenidas: lo usan los autos de una sola avenida por vez.
type Crossing = { holders: Set<Car> };

// Senda sobre una avenida: `at` es su medio, a lo largo de la avenida.
type Zebra = { lane: Lane; at: number; busy: number };

// Avenida: una fila (h) o una columna (v) que es calle de punta a punta.
type Lane = {
  axis: Axis;
  line: number; // la fila o la columna
  length: number;
  crossings: { at: number; crossing: Crossing }[]; // `at`: dónde empieza la celda del cruce
  zebras: Zebra[];
};

type Car = {
  lane: Lane;
  dir: 1 | -1; // 1: hacia la derecha o hacia abajo del mapa
  s: number; // el centro del auto, a lo largo de la avenida
  v: number;
  cruise: number;
  len: number;
  wide: number;
  kind: 'auto' | 'taxi' | 'colectivo';
  color: string;
  holds: Set<Crossing>;
  stuck: number;
  alpha: number;
  fading: boolean;
};

// Veredas y sendas como un grafo: nodos donde se puede elegir por dónde seguir.
type Node = { x: number; y: number; edges: Edge[]; exit: boolean };
type Edge = { a: Node; b: Node; pts: [number, number][]; len: number; zebra: Zebra | null };

type Walker = {
  home: string; // el barrio que la puso en la calle
  edge: Edge;
  from: Node;
  d: number; // cuánto lleva caminado del tramo
  next: Edge | null; // el tramo que eligió al llegar a la punta, si está esperando para cruzar
  speed: number;
  pause: number;
  wait: number;
  step: number; // fase del paso, para mover las piernas
  age: number;
  life: number; // al cumplirla se mete en algún lado
  alpha: number;
  fading: boolean;
  gone: boolean;
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
};

type Network = {
  lanes: Lane[];
  exits: Node[]; // por donde se entra y se sale del tablero caminando
  strolls: Edge[]; // tramos de vereda donde puede aparecer alguien
  laneTiles: number;
};

// Dónde puede aparecer la gente de cada barrio: sus tramos de vereda y sus bordes.
type Home = { strolls: Edge[]; exits: Node[]; walkTiles: number };

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const other = (edge: Edge, node: Node) => (edge.a === node ? edge.b : edge.a);

type Grid = Pick<Scene, 'cols' | 'rows' | 'lots' | 'works' | 'barrios' | 'timezone'>;

// Qué celdas están construidas: si no cambia, la red de calles es la misma.
const gridKey = (g: Grid) =>
  `${g.cols}x${g.rows}:${[...g.lots, ...g.works]
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(' ')}`;

export class Traffic {
  private net: Network | null = null;
  private homes = new Map<string, Home>();
  private streetOf: (x: number, y: number) => string | null = () => null;
  // Cuánto se usa cada avenida: 1 menos la parte de su largo que está rota.
  private use = new Map<Lane, number>();
  private source: { lots: Grid['lots']; works: Grid['works']; key: string } | null = null;
  private cars: Car[] = [];
  private people: Walker[] = [];
  private last: number | null = null;
  private nextCar = 0;
  private nextWalker = 0;
  private readonly still =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Avanza el tránsito hasta `time` (ms, el reloj de requestAnimationFrame).
  update(scene: Grid, time: number) {
    const dt = this.last === null ? 0 : Math.min(0.1, Math.max(0, (time - this.last) / 1000));
    this.last = time;

    // Los lotes llegan de nuevo con cada cambio de estado, pero no se mueven de lugar:
    // la red se arma otra vez solo si cambió la grilla.
    let fresh = false;
    if (this.source?.lots !== scene.lots || this.source.works !== scene.works) {
      const key = gridKey(scene);
      if (key !== this.source?.key) {
        this.net = buildNetwork(streetsOf(scene.cols, scene.rows, [...scene.lots, ...scene.works]));
        this.homes = homesOf(this.net, scene);
        this.streetOf = streetBarrios(scene.cols, scene.rows, scene.lots, scene.barrios);
        this.cars = [];
        this.people = [];
        fresh = true;
      }
      this.source = { lots: scene.lots, works: scene.works, key };
    }
    const net = this.net!;

    const share = this.still ? 0 : SHARE[phaseAt(new Date(), scene.timezone)];
    // Una avenida pierde autos según cuánto de su largo está roto.
    const broken = new Set(
      scene.barrios.filter((b) => b.streets !== undefined && streetsLevel(b.streets) === 'rotas').map((b) => b.id),
    );
    let usable = 0;
    for (const lane of net.lanes) {
      let bad = 0;
      for (let i = 0; i < lane.length; i++) {
        const id = lane.axis === 'h' ? this.streetOf(i, lane.line) : this.streetOf(lane.line, i);
        if (id && broken.has(id)) bad++;
      }
      const use = 1 - bad / lane.length;
      this.use.set(lane, use);
      usable += lane.length * use;
    }
    const carTarget = Math.round(Math.min(MAX_CARS, usable / TILES_PER_CAR) * share);
    const walkerTargets = new Map<string, number>();
    for (const barrio of scene.barrios) {
      const home = this.homes.get(barrio.id);
      if (!home) continue;
      const people = Math.min(
        MAX_WALKERS_PER_BARRIO,
        Math.ceil((barrio.population ?? 0) / CITIZENS_PER_WALKER),
        home.walkTiles / TILES_PER_WALKER,
      );
      walkerTargets.set(barrio.id, Math.round(people * share));
    }

    // Al abrir el mapa la ciudad ya está andando: se reparten por adentro.
    if (fresh) {
      for (let i = 0; i < carTarget * 6 && this.cars.length < carTarget; i++) this.spawnCar(true);
      for (const [id, target] of walkerTargets) {
        for (let i = 0; i < target; i++) this.spawnWalker(id, true);
      }
    }

    this.stepCars(dt);
    this.stepWalkers(dt);

    // Después entran de a uno, espaciados, para que no aparezcan en tanda.
    this.nextCar -= dt;
    if (this.cars.length < carTarget && this.nextCar <= 0 && this.spawnCar(false)) {
      this.nextCar = 2 + Math.random() * 4;
    }
    // La gente también entra de a una, por el barrio al que más le falta.
    this.nextWalker -= dt;
    if (this.nextWalker <= 0) {
      let home: string | null = null;
      let missing = 0;
      for (const [id, target] of walkerTargets) {
        const gap = target - this.people.filter((w) => w.home === id).length;
        if (gap > missing) {
          missing = gap;
          home = id;
        }
      }
      if (home && this.spawnWalker(home, Math.random() < 0.3)) this.nextWalker = 1.5 + Math.random() * 3;
    }
  }

  // --- Autos -----------------------------------------------------------

  // `inside`: en algún lugar de la avenida (al abrir el mapa); si no, entrando por el borde.
  private spawnCar(inside: boolean): boolean {
    // Se elige la avenida según cuánto se usa: por una rota entera no entra nadie.
    const lanes = (this.net?.lanes ?? []).filter((l) => (this.use.get(l) ?? 1) > 0);
    if (!lanes.length) return false;
    let r = Math.random() * lanes.reduce((sum, l) => sum + (this.use.get(l) ?? 1), 0);
    const lane = lanes.find((l) => (r -= this.use.get(l) ?? 1) <= 0) ?? lanes[lanes.length - 1];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const start = dir > 0 ? 0 : -lane.length; // el borde de entrada, contado en su sentido

    const roll = Math.random();
    const bus = roll < 0.12 && !this.cars.some((c) => c.kind === 'colectivo');
    const kind = bus ? 'colectivo' : roll < 0.3 ? 'taxi' : 'auto';
    const len = bus ? 0.58 : 0.3;

    let u = start - 0.6;
    if (inside) {
      u = start + 0.5 + Math.random() * (lane.length - 1);
      // Nunca adentro de un cruce, que tiene dueño.
      const nearCrossing = lane.crossings.some(({ at }) => {
        const entry = dir > 0 ? at : -(at + 1);
        return u > entry - 0.8 && u < entry + 1.5;
      });
      if (nearCrossing) return false;
    }
    if (this.cars.some((c) => c.lane === lane && c.dir === dir && Math.abs(c.s * dir - u) < 1.1)) return false;

    const cruise = bus ? 0.6 + Math.random() * 0.1 : 0.75 + Math.random() * 0.3;
    this.cars.push({
      lane,
      dir,
      s: u * dir,
      v: cruise * 0.8,
      cruise,
      len,
      wide: bus ? 0.2 : 0.17,
      kind,
      color: bus ? pick(BUS_COLORS) : kind === 'taxi' ? TAXI_BODY : pick(CAR_COLORS),
      holds: new Set(),
      stuck: 0,
      alpha: inside ? 0 : 1,
      fading: false,
    });
    return true;
  }

  // Trabajamos en `u = s * dir`: así "adelante" siempre es un número más grande.
  private stepCars(dt: number) {
    for (const car of this.cars) {
      const { lane, dir } = car;
      const u = car.s * dir;
      const front = u + car.len / 2;
      const rear = u - car.len / 2;
      let limit = Infinity; // hasta dónde puede llegar la trompa

      for (const o of this.cars) {
        if (o === car || o.lane !== lane || o.dir !== dir) continue;
        const ou = o.s * dir;
        if (ou > u) limit = Math.min(limit, ou - o.len / 2 - CAR_GAP);
      }

      for (const z of lane.zebras) {
        if (!z.busy) continue;
        const near = dir > 0 ? z.at - ZEBRA_DEPTH / 2 : -(z.at + ZEBRA_DEPTH / 2);
        if (front <= near + 0.02) limit = Math.min(limit, near - 0.06);
      }

      for (const { at, crossing } of lane.crossings) {
        const entry = dir > 0 ? at : -(at + 1);
        if (rear > entry + 1) {
          // Ya lo pasó entero: lo suelta.
          crossing.holders.delete(car);
          car.holds.delete(crossing);
          continue;
        }
        if (car.holds.has(crossing)) continue;
        // Lo pide al acercarse. Si lo tiene la otra avenida, espera antes de la senda.
        const stop = entry - ZEBRA.edge - ZEBRA_DEPTH - 0.07;
        const free = [...crossing.holders].every((o) => o.lane.axis === lane.axis);
        if (free && front > stop - 0.9) {
          crossing.holders.add(car);
          car.holds.add(crossing);
          continue;
        }
        if (front <= stop + 0.02) limit = Math.min(limit, stop);
      }

      // Frena de a poco al acercarse al límite y arranca suave.
      const gap = limit - front;
      const want = Math.min(car.cruise, Math.max(0, gap) * 1.6);
      car.v += Math.max(-3 * dt, Math.min(0.8 * dt, want - car.v));
      const step = Math.min(Math.max(0, car.v) * dt, Math.max(0, gap));
      car.s += step * dir;

      // Por las dudas: si alguno queda trabado mucho rato, se desvanece y deja pasar.
      car.stuck = step < 0.02 * dt ? car.stuck + dt : 0;
      if (car.stuck > 15) car.fading = true;
      car.alpha = car.fading ? car.alpha - dt / FADE_S : Math.min(1, car.alpha + dt / FADE_S);
    }

    this.cars = this.cars.filter((car) => {
      const end = car.dir > 0 ? car.lane.length : 0;
      const gone = car.fading ? car.alpha <= 0 : car.s * car.dir - car.len / 2 > end + 0.1;
      if (gone) for (const crossing of car.holds) crossing.holders.delete(car);
      return !gone;
    });
  }

  // --- Gente -----------------------------------------------------------

  // `inside`: aparece en una vereda de su barrio (sale de algún lado); si no, entra
  // caminando por un borde de su barrio. Después camina por donde quiera.
  private spawnWalker(homeId: string, inside: boolean): boolean {
    const home = this.homes.get(homeId);
    if (!home) return false;
    let edge: Edge;
    let from: Node;
    let d = 0;
    if (!inside && home.exits.length) {
      from = pick(home.exits);
      edge = from.edges[0];
    } else if (home.strolls.length) {
      edge = pick(home.strolls);
      from = Math.random() < 0.5 ? edge.a : edge.b;
      d = Math.random() * edge.len;
    } else {
      return false;
    }
    this.people.push({
      home: homeId,
      edge,
      from,
      d,
      next: null,
      speed: 0.2 + Math.random() * 0.12,
      pause: 0,
      wait: 0,
      step: Math.random() * Math.PI * 2,
      age: 0,
      life: 40 + Math.random() * 80,
      alpha: 0,
      fading: false,
      gone: false,
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      skin: pick(SKINS),
      hair: pick(HAIR),
    });
    return true;
  }

  private stepWalkers(dt: number) {
    for (const w of this.people) {
      w.age += dt;
      if (!w.fading && w.age > w.life && !w.edge.zebra) w.fading = true;
      w.alpha = w.fading ? w.alpha - dt / FADE_S : Math.min(1, w.alpha + dt / FADE_S);

      if (w.pause > 0) {
        w.pause -= dt;
        continue;
      }
      if (w.d < w.edge.len) {
        w.d = Math.min(w.edge.len, w.d + w.speed * dt);
        w.step += dt * w.speed * 55;
        continue;
      }

      // Llegó a la punta del tramo: elige por dónde sigue.
      const at = other(w.edge, w.from);
      if (at.exit) {
        w.gone = true;
        continue;
      }
      // Quien ya se está yendo no empieza a cruzar: se desvanecería en la mitad de la calle.
      if (!w.next || (w.fading && w.next.zebra)) w.next = nextEdge(at, w.edge, w.fading);
      if (w.next.zebra && !this.zebraClear(w.next.zebra)) {
        // Espera en el cordón. Si no dejan de pasar autos, sigue por la vereda.
        w.wait += dt;
        if (w.wait > 6) w.next = nextEdge(at, w.edge, true);
        continue;
      }
      if (w.edge.zebra) w.edge.zebra.busy--;
      if (w.next.zebra) w.next.zebra.busy++;
      w.from = at;
      w.edge = w.next;
      w.next = null;
      w.d = 0;
      w.wait = 0;
      // De vez en cuando se para a mirar algo.
      if (!w.edge.zebra && Math.random() < 0.06) w.pause = 1 + Math.random() * 3;
    }
    this.people = this.people.filter((w) => {
      const gone = w.gone || (w.fading && w.alpha <= 0);
      // Si se fue desde una senda, la deja libre: si no, los autos esperarían para siempre.
      if (gone && w.edge.zebra) w.edge.zebra.busy--;
      return !gone;
    });
  }

  // Se cruza si no hay un auto sobre la senda ni uno andando que esté por llegar.
  private zebraClear(z: Zebra): boolean {
    return this.cars.every((car) => {
      if (car.lane !== z.lane) return true;
      const gap = Math.abs(car.s - z.at) - car.len / 2 - ZEBRA_DEPTH / 2;
      if (gap < 0.03) return false;
      const coming = (z.at - car.s) * car.dir > 0;
      return !(coming && car.v > 0.05 && gap < 1.4);
    });
  }

  // --- Dibujo ----------------------------------------------------------

  drawCars(ctx: CanvasRenderingContext2D, layout: Layout) {
    const { tile: t, ox, oy } = layout;
    for (const car of this.cars) {
      const { x, y, angle } = poseOf(car);
      const L = car.len * t;
      const W = car.wide * t;
      ctx.save();
      ctx.globalAlpha = Math.max(0, car.alpha);
      ctx.translate(ox + x * t, oy + y * t);
      // Sombra hacia la derecha y apenas abajo, como la de los edificios.
      ctx.save();
      ctx.translate(t * 0.028, t * 0.018);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(38, 32, 24, 0.2)';
      ctx.beginPath();
      ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.32);
      ctx.fill();
      ctx.restore();
      ctx.rotate(angle);
      paintCar(ctx, car, L, W, t);
      ctx.restore();
    }
  }

  // De noche: faros para adelante y luces rojas atrás.
  drawHeadlights(ctx: CanvasRenderingContext2D, layout: Layout) {
    const { tile: t, ox, oy } = layout;
    for (const car of this.cars) {
      const { x, y, angle } = poseOf(car);
      const L = car.len * t;
      const W = car.wide * t;
      const reach = t * 0.6;
      ctx.save();
      ctx.globalAlpha = Math.max(0, car.alpha);
      ctx.translate(ox + x * t, oy + y * t);
      ctx.rotate(angle);
      const beam = ctx.createLinearGradient(L / 2, 0, L / 2 + reach, 0);
      beam.addColorStop(0, 'rgba(255, 232, 160, 0.34)');
      beam.addColorStop(1, 'rgba(255, 232, 160, 0)');
      ctx.fillStyle = beam;
      poly(ctx, [
        [L / 2, -W * 0.4],
        [L / 2 + reach, -W * 0.95],
        [L / 2 + reach, W * 0.95],
        [L / 2, W * 0.4],
      ]);
      ctx.fill();
      const dot = Math.max(1, W * 0.12);
      ctx.shadowBlur = t * 0.06;
      ctx.shadowColor = 'rgba(255, 220, 140, 0.9)';
      ctx.fillStyle = '#fff3c4';
      for (const side of [-1, 1]) dotAt(ctx, L / 2 - dot, side * W * 0.3, dot);
      ctx.shadowColor = 'rgba(255, 80, 60, 0.8)';
      ctx.fillStyle = '#ff5a48';
      for (const side of [-1, 1]) dotAt(ctx, -L / 2 + dot, side * W * 0.3, dot * 0.8);
      ctx.restore();
    }
  }

  // Cada persona, lista para ordenarse con los árboles por dónde apoya los pies.
  walkers(ctx: CanvasRenderingContext2D, layout: Layout): { y: number; paint: () => void }[] {
    const { tile: t, ox, oy } = layout;
    // Muy de lejos no se distinguen: serían ruido.
    if (t < 16) return [];
    return this.people.map((w) => {
      const { x, y, dx, dy } = placeOf(w);
      const px = ox + (x - dy * WALKER_SIDE) * t;
      const py = oy + (y + dx * WALKER_SIDE) * t;
      return { y: py, paint: () => paintWalker(ctx, w, px, py, t) };
    });
  }
}

// --- Red -----------------------------------------------------------------

function buildNetwork(g: Streets): Network {
  const { cols, rows } = g;
  const c = CURB / 2; // el medio de la vereda

  // Avenidas: filas y columnas que son calle de punta a punta. Se cruzan donde se tocan.
  const rowLanes = new Map<number, Lane>();
  const colLanes = new Map<number, Lane>();
  for (let y = 0; y < rows; y++) {
    let full = true;
    for (let x = 0; x < cols; x++) full &&= g.isStreet(x, y);
    if (full) rowLanes.set(y, { axis: 'h', line: y, length: cols, crossings: [], zebras: [] });
  }
  for (let x = 0; x < cols; x++) {
    let full = true;
    for (let y = 0; y < rows; y++) full &&= g.isStreet(x, y);
    if (full) colLanes.set(x, { axis: 'v', line: x, length: rows, crossings: [], zebras: [] });
  }
  for (const h of rowLanes.values()) {
    for (const v of colLanes.values()) {
      const crossing: Crossing = { holders: new Set() };
      h.crossings.push({ at: v.line, crossing });
      v.crossings.push({ at: h.line, crossing });
    }
  }

  // Veredas: un tramo por el medio de cada franja de vereda, cortado donde toca una senda.
  const nodes = new Map<string, Node>();
  const node = (x: number, y: number) => {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { x, y, edges: [], exit: false }));
    return n;
  };
  const edges: Edge[] = [];
  const link = (pts: [number, number][], zebra: Zebra | null = null) => {
    const a = node(...pts[0]);
    const b = node(...pts[pts.length - 1]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const edge: Edge = { a, b, pts, len, zebra };
    a.edges.push(edge);
    b.edges.push(edge);
    edges.push(edge);
  };
  const chain = (pts: [number, number][]) => {
    for (let i = 1; i < pts.length; i++) link([pts[i - 1], pts[i]]);
  };
  // Las sendas se dibujan solo junto a cruces de adentro del tablero.
  const crossingAt = (x: number, y: number) => g.inside(x, y) && g.isCrossing(x, y);
  const zebraOn = (lane: Lane | undefined, at: number) => {
    if (!lane) return null;
    const z: Zebra = { lane, at, busy: 0 };
    lane.zebras.push(z);
    return z;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!g.isStreet(x, y)) continue;
      const n = g.isStreet(x, y - 1);
      const s = g.isStreet(x, y + 1);
      const e = g.isStreet(x + 1, y);
      const w = g.isStreet(x - 1, y);
      // Las puntas de la franja: contra un lote dobla por dentro, si no sigue hasta el borde.
      const west = w ? x : x + c;
      const east = e ? x + 1 : x + 1 - c;
      const north = n ? y : y + c;
      const south = s ? y + 1 : y + 1 - c;
      const xs = [west, crossingAt(x - 1, y) && x + ZEBRA_MID, crossingAt(x + 1, y) && x + 1 - ZEBRA_MID, east];
      const ys = [north, crossingAt(x, y - 1) && y + ZEBRA_MID, crossingAt(x, y + 1) && y + 1 - ZEBRA_MID, south];
      const cutX = xs.filter((v): v is number => v !== false);
      const cutY = ys.filter((v): v is number => v !== false);
      if (!n) chain(cutX.map((v): [number, number] => [v, y + c]));
      if (!s) chain(cutX.map((v): [number, number] => [v, y + 1 - c]));
      if (!w) chain(cutY.map((v): [number, number] => [x + c, v]));
      if (!e) chain(cutY.map((v): [number, number] => [x + 1 - c, v]));

      // Sendas: se cruzan si del otro lado también hay vereda. Las que atraviesan una
      // avenida quedan anotadas en ella, para que los autos frenen.
      if (!n && !s) {
        for (const at of [crossingAt(x - 1, y) && x + ZEBRA_MID, crossingAt(x + 1, y) && x + 1 - ZEBRA_MID]) {
          if (at !== false) link([[at, y + c], [at, y + 1 - c]], zebraOn(rowLanes.get(y), at));
        }
      }
      if (!w && !e) {
        for (const at of [crossingAt(x, y - 1) && y + ZEBRA_MID, crossingAt(x, y + 1) && y + 1 - ZEBRA_MID]) {
          if (at !== false) link([[x + c, at], [x + 1 - c, at]], zebraOn(colLanes.get(x), at));
        }
      }

      // Esquinas de afuera: la vereda dobla alrededor de la punta del lote de la diagonal.
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        if (!g.inside(x + dx, y) || !g.inside(x, y + dy)) continue;
        if (!g.isStreet(x + dx, y) || !g.isStreet(x, y + dy) || g.isStreet(x + dx, y + dy)) continue;
        const cx = x + (dx > 0 ? 1 : 0);
        const cy = y + (dy > 0 ? 1 : 0);
        link([
          [cx, cy - dy * c],
          [cx, cy],
          [cx - dx * c, cy],
        ]);
      }
    }
  }

  // Las veredas que llegan al borde siguen un poco afuera: por ahí se entra y se sale.
  const exits: Node[] = [];
  for (const n of [...nodes.values()]) {
    const onBorder = n.x < 1e-6 || n.y < 1e-6 || n.x > cols - 1e-6 || n.y > rows - 1e-6;
    if (!onBorder || n.edges.length !== 1) continue;
    const o = other(n.edges[0], n);
    const d = Math.hypot(n.x - o.x, n.y - o.y) || 1;
    const out: [number, number] = [n.x + ((n.x - o.x) / d) * EXIT_REACH, n.y + ((n.y - o.y) / d) * EXIT_REACH];
    link([[n.x, n.y], out]);
    const exit = node(...out);
    exit.exit = true;
    exits.push(exit);
  }

  const strolls = edges.filter((e) => !e.zebra && !e.a.exit && !e.b.exit && e.len > 0.3);
  const lanes = [...rowLanes.values(), ...colLanes.values()];
  return {
    lanes,
    exits,
    strolls,
    laneTiles: lanes.reduce((sum, l) => sum + l.length, 0),
  };
}

// Reparte las veredas y los bordes entre los barrios. Una vereda es del barrio del lote que
// tiene enfrente: así cada mano de la avenida del medio es de su lado. Si enfrente no hay
// lote (una esquina, una obra), es del barrio de la celda de calle (docs/05 §18).
function homesOf(net: Network, grid: Grid): Map<string, Home> {
  const { cols, rows } = grid;
  const lotAt = new Map(grid.lots.map((l) => [`${l.x},${l.y}`, l.barrio_id]));
  const streetOf = streetBarrios(cols, rows, grid.lots, grid.barrios);
  const barrioOf = (px: number, py: number) => {
    const x = Math.min(cols - 1e-6, Math.max(0, px));
    const y = Math.min(rows - 1e-6, Math.max(0, py));
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    // El borde de la celda más cercano es el cordón de esta vereda; el lote está del otro lado.
    const fx = x - cx;
    const fy = y - cy;
    const [dx, dy] = Math.min(fx, 1 - fx) < Math.min(fy, 1 - fy) ? [fx < 0.5 ? -1 : 1, 0] : [0, fy < 0.5 ? -1 : 1];
    return lotAt.get(`${cx + dx},${cy + dy}`) ?? streetOf(cx, cy);
  };
  const homes = new Map<string, Home>();
  const homeOf = (x: number, y: number) => {
    const id = barrioOf(x, y);
    if (!id) return null;
    let home = homes.get(id);
    if (!home) homes.set(id, (home = { strolls: [], exits: [], walkTiles: 0 }));
    return home;
  };
  for (const edge of net.strolls) {
    const home = homeOf((edge.a.x + edge.b.x) / 2, (edge.a.y + edge.b.y) / 2);
    if (!home) continue;
    home.strolls.push(edge);
    home.walkTiles += edge.len;
  }
  // Un borde es de quien tenga la vereda que llega a él: se mira un poco adentro del tablero.
  for (const exit of net.exits) {
    const edge = exit.edges[0];
    const border = other(edge, exit);
    const d = Math.hypot(border.x - exit.x, border.y - exit.y) || 1;
    const inward = 0.3 / d;
    homeOf(border.x + (border.x - exit.x) * inward, border.y + (border.y - exit.y) * inward)?.exits.push(exit);
  }
  return homes;
}

// Al llegar a una punta: cualquier camino menos volver, y cruzar es menos común que seguir.
function nextEdge(at: Node, came: Edge, avoidZebras: boolean): Edge {
  const options = at.edges.filter((e) => e !== came && !(avoidZebras && e.zebra));
  if (!options.length) return came; // calle sin salida: se vuelve
  const weights = options.map((e) => (e.zebra ? 0.6 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

// --- Posiciones ------------------------------------------------------------

// Mano derecha: hacia la derecha del mapa por la mitad de abajo, hacia abajo por la de la izquierda.
function poseOf(car: Car): { x: number; y: number; angle: number } {
  const side = car.dir * LANE_OFFSET;
  if (car.lane.axis === 'h') return { x: car.s, y: car.lane.line + 0.5 + side, angle: car.dir > 0 ? 0 : Math.PI };
  return { x: car.lane.line + 0.5 - side, y: car.s, angle: (car.dir * Math.PI) / 2 };
}

// Dónde está y para dónde mira, recorriendo el tramo desde el nodo del que salió.
function placeOf(w: Walker): { x: number; y: number; dx: number; dy: number } {
  const pts = w.from === w.edge.a ? w.edge.pts : [...w.edge.pts].reverse();
  let d = w.d;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
    if (d <= seg || i === pts.length - 1) {
      const k = Math.min(1, d / seg);
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, dx: (x1 - x0) / seg, dy: (y1 - y0) / seg };
    }
    d -= seg;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
}

// --- Figuras ---------------------------------------------------------------

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function dotAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Un auto visto desde arriba, mirando hacia +x: carrocería, vidrios, techo y luces.
function paintCar(ctx: CanvasRenderingContext2D, car: Car, L: number, W: number, t: number) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.8, t * 0.01);
  ctx.strokeStyle = darken(car.color, 0.45);
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.32);
  ctx.fill();
  ctx.stroke();

  if (car.kind === 'colectivo') {
    // Techo claro con dos escotillas; el parabrisas ocupa todo el frente.
    ctx.fillStyle = lighten(car.color, 0.62);
    ctx.beginPath();
    ctx.roundRect(-L * 0.42, -W * 0.36, L * 0.8, W * 0.72, W * 0.12);
    ctx.fill();
    ctx.fillStyle = mix(car.color, '#ffffff', 0.3);
    for (const k of [-0.22, 0.1]) ctx.fillRect(L * k - L * 0.05, -W * 0.18, L * 0.1, W * 0.36);
    ctx.fillStyle = WINDSHIELD;
    ctx.beginPath();
    ctx.roundRect(L * 0.4, -W * 0.4, L * 0.07, W * 0.8, W * 0.06);
    ctx.fill();
  } else {
    // Parabrisas y luneta en trapecio: el vidrio baja hacia el capó y hacia el baúl.
    ctx.fillStyle = WINDSHIELD;
    poly(ctx, [
      [L * 0.08, -W * 0.36],
      [L * 0.25, -W * 0.42],
      [L * 0.25, W * 0.42],
      [L * 0.08, W * 0.36],
    ]);
    ctx.fill();
    poly(ctx, [
      [-L * 0.24, -W * 0.36],
      [-L * 0.36, -W * 0.4],
      [-L * 0.36, W * 0.4],
      [-L * 0.24, W * 0.36],
    ]);
    ctx.fill();
    // Techo: lo que más luz recibe. El del taxi, amarillo.
    ctx.fillStyle = car.kind === 'taxi' ? TAXI_ROOF : lighten(car.color, 0.16);
    ctx.beginPath();
    ctx.roundRect(-L * 0.24, -W * 0.36, L * 0.32, W * 0.72, W * 0.1);
    ctx.fill();
  }

  ctx.fillStyle = '#fff6da';
  for (const y of [-W * 0.38, W * 0.2]) ctx.fillRect(L / 2 - L * 0.05, y, L * 0.04, W * 0.18);
  ctx.fillStyle = '#c8412f';
  for (const y of [-W * 0.38, W * 0.22]) ctx.fillRect(-L / 2 + L * 0.01, y, L * 0.04, W * 0.16);
}

// Una persona parada, con el mismo ojo alto que los árboles: piernas, torso y cabeza.
// (x, y) es donde apoya los pies.
function paintWalker(ctx: CanvasRenderingContext2D, w: Walker, x: number, y: number, t: number) {
  const k = t * 0.12; // el alto de la persona
  const moving = w.pause <= 0 && w.d < w.edge.len;
  const swing = moving ? Math.sin(w.step) * k * 0.1 : 0;
  const bob = moving ? Math.abs(Math.cos(w.step)) * k * 0.04 : 0;

  ctx.save();
  ctx.globalAlpha = Math.max(0, w.alpha);
  ctx.fillStyle = 'rgba(38, 32, 24, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x + k * 0.1, y, k * 0.26, k * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = w.pants;
  ctx.lineWidth = Math.max(0.8, k * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - k * 0.07, y - k * 0.32);
  ctx.lineTo(x - k * 0.07 + swing, y);
  ctx.moveTo(x + k * 0.07, y - k * 0.32);
  ctx.lineTo(x + k * 0.07 - swing, y);
  ctx.stroke();

  ctx.fillStyle = w.shirt;
  ctx.beginPath();
  ctx.roundRect(x - k * 0.18, y - k * 0.72 - bob, k * 0.36, k * 0.44, k * 0.14);
  ctx.fill();

  ctx.fillStyle = w.skin;
  dotAt(ctx, x, y - k * 0.84 - bob, k * 0.15);
  ctx.fillStyle = w.hair;
  ctx.beginPath();
  ctx.arc(x, y - k * 0.86 - bob, k * 0.15, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
