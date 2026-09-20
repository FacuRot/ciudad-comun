// Dibuja la ciudad entera en cada cuadro. Sin optimizaciones: son ~100 celdas.
//
// El suelo se mira desde arriba, pero los edificios se dibujan en tres cuartos:
// se ve el frente, el lado derecho y el techo. El fondo corre hacia arriba y a
// la derecha (DEPTH), la luz viene de la izquierda —así que el lado derecho va
// más oscuro— y la sombra cae hacia abajo a la derecha.
import type { BuildingType, MapBarrio as Barrio, MapLot as Lot, MapWork as PublicWork } from '../types/game';
import { workPercent, type Cell } from '../game/geo';
import { formatRemaining } from '../game/format';
import type { Layout } from './layout';
import { ABANDONED, darken, desaturate, lighten, lotColor, mix } from './colors';
import { phaseAt, type Phase } from './time';

export type LotMark = 'claimable' | 'suggested' | 'blocked';

export type Scene = {
  cols: number;
  rows: number;
  lots: Lot[];
  works: PublicWork[];
  barrios: Barrio[];
  constructions?: { lot_id: string; ends_at: string }[]; // solo las en curso
  timezone: string;
  myLotId?: string | null;
  selectedLotId?: string | null;
  selectedWorkId?: string | null;
  marks?: Map<string, LotMark>; // pantalla de entrada: qué lotes libres se pueden tomar
  hovered?: Cell | null;
};

type Theme = {
  ground: string; // el suelo de afuera, donde no llega la ciudad
  board: string; // el terreno de la ciudad
  sidewalk: string; // vereda
  asphalt: string; // calzada
  line: string; // marcas pintadas de la calle
  ink: string;
  overlay: string | null;
};

const DAY: Theme = {
  ground: '#ded6c1',
  board: '#efe9da',
  sidewalk: '#e0d8c5',
  asphalt: '#b3ada0',
  line: 'rgba(255, 252, 240, 0.85)',
  ink: '#3b3a36',
  overlay: null,
};

const THEME: Record<Phase, Theme> = {
  dia: DAY,
  atardecer: {
    ...DAY,
    ground: '#d6c3a8',
    board: '#eadbc6',
    sidewalk: '#dccbb2',
    asphalt: '#aea08f',
    line: 'rgba(255, 246, 228, 0.8)',
    overlay: 'rgba(255, 140, 60, 0.10)',
  },
  noche: { ...DAY, ink: '#f1ecdf', overlay: 'rgba(16, 24, 48, 0.58)' },
};

const ACCENT = '#2b8a80';
const WORKING = '#e8910c';
const FOLIAGE = ['#6f9440', '#83a84e', '#5d8237'];
const TRUNK = '#8a6a45';
const GLASS = '#9fc0cc';

// Cuánto corre el fondo del edificio respecto del frente, en tiles.
const DEPTH_X = 0.2;
const DEPTH_Y = 0.115;
// Altura del lote donde apoya el frente de todo lo que se construye.
const GROUND = 0.82;

// Ancho del frente y alto de las paredes (base más un tramo por nivel), en tiles.
const SHAPE: Record<BuildingType, { w: number; h: number; step: number }> = {
  ladrilleria: { w: 0.5, h: 0.2, step: 0.07 }, // fábrica ancha y baja
  aserradero: { w: 0.46, h: 0.16, step: 0.06 }, // galpón
  generador: { w: 0.36, h: 0.23, step: 0.09 }, // usina angosta y alta
  plaza: { w: 0.5, h: 0, step: 0 },
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

// Número estable entre 0 y 1: da variedad a los tiles sin que titilen entre cuadros.
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1024) / 1024;
}

function softShadow(ctx: CanvasRenderingContext2D, blur: number, dy: number, alpha = 0.18) {
  ctx.shadowColor = `rgba(38, 32, 24, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export function drawScene(ctx: CanvasRenderingContext2D, layout: Layout, scene: Scene, now: number) {
  const theme = THEME[phaseAt(new Date(now), scene.timezone)];
  const night = theme.overlay !== null && theme.ink !== THEME.dia.ink;
  const { tile: t, ox, oy, cols, rows } = layout;
  const at = (c: Cell) => ({ px: ox + c.x * t, py: oy + c.y * t });

  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // La ciudad es una tabla apoyada sobre el fondo: sombra suave y esquinas redondeadas.
  ctx.save();
  softShadow(ctx, t * 0.4, t * 0.08, 0.22);
  ctx.fillStyle = theme.board;
  roundRect(ctx, ox, oy, cols * t, rows * t, t * 0.22);
  ctx.fill();
  ctx.restore();

  drawStreets(ctx, layout, scene, theme);

  // Capa de suelo. Van primero todos los terrenos: así ninguna parcela le pisa
  // el pie al edificio del vecino.
  for (const lot of scene.lots) {
    const { px, py } = at(lot);
    drawParcel(ctx, lot, px, py, t, scene, now);
  }
  for (const work of scene.works) {
    const { px, py } = at(work);
    drawWorkPlate(ctx, work, px, py, t);
  }

  // Capa de volumen, de atrás hacia adelante: lo que está más abajo en el mapa
  // está más cerca, así que se dibuja después y tapa lo de arriba.
  const volumes: { y: number; x: number; paint: () => void }[] = [];
  for (const lot of scene.lots) {
    if (lot.status !== 'ocupado' || lot.level === 0 || !lot.building_type) continue;
    const { px, py } = at(lot);
    const type = lot.building_type;
    const color = lotShade(lot);
    volumes.push({
      y: lot.y,
      x: lot.x,
      paint: () => drawBuilding(ctx, type, lot.level, px, py, t, color, lot.state === 'activo', now, lot.id),
    });
  }
  for (const work of scene.works) {
    const { px, py } = at(work);
    volumes.push({ y: work.y, x: work.x, paint: () => drawWorkBuilding(ctx, work, px, py, t) });
  }
  volumes.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const v of volumes) v.paint();

  // El filtro cubre todo el canvas, no solo la grilla, para que los márgenes también oscurezcan.
  if (theme.overlay) {
    ctx.fillStyle = theme.overlay;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  // De noche, luces encendidas donde hay gente.
  if (night) {
    for (const lot of scene.lots) {
      if (lot.status === 'ocupado' && lot.state === 'activo' && lot.level > 0 && lot.building_type) {
        const { px, py } = at(lot);
        drawNightLights(ctx, lot.building_type, lot.level, px, py, t);
      }
    }
  }

  // Estado del lote por encima del filtro: el pasto y la mano de "cuidar" tienen que verse también de noche.
  for (const lot of scene.lots) {
    if (lot.status !== 'ocupado') continue;
    const { px, py } = at(lot);
    if (lot.state === 'descuidado') drawGrass(ctx, px, py, t);
    if (lot.state === 'abandonado') drawCare(ctx, px, py, t);
  }

  // Construcciones en curso, por encima del filtro para que se vean también de noche.
  const building = new Map((scene.constructions ?? []).map((c) => [c.lot_id, Date.parse(c.ends_at)]));
  for (const lot of scene.lots) {
    if (!building.has(lot.id)) continue;
    const { px, py } = at(lot);
    drawWorking(ctx, px, py, t, now);
  }

  // Textos por encima del filtro de noche.
  for (const work of scene.works) {
    const { px, py } = at(work);
    ctx.save();
    ctx.fillStyle = theme.ink;
    ctx.font = `600 ${Math.round(t * 0.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(work.name, px + t / 2, py + t * 0.12);
    ctx.restore();
  }
  drawClosedBarrios(ctx, scene, layout, theme.ink);

  for (const id of [scene.myLotId, scene.selectedLotId]) {
    const lot = id ? scene.lots.find((l) => l.id === id) : null;
    if (!lot) continue;
    const { px, py } = at(lot);
    ctx.strokeStyle = id === scene.selectedLotId ? ACCENT : theme.ink;
    ctx.lineWidth = Math.max(2, t * 0.045);
    roundRect(ctx, px + t * 0.05, py + t * 0.05, t * 0.9, t * 0.9, t * 0.16);
    ctx.stroke();
  }

  const selectedWork = scene.selectedWorkId ? scene.works.find((w) => w.id === scene.selectedWorkId) : null;
  if (selectedWork) {
    const { px, py } = at(selectedWork);
    const out = t * 0.05;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, t * 0.045);
    roundRect(ctx, px - out, py - out, t + out * 2, t + out * 2, t * 0.16);
    ctx.stroke();
  }

  if (scene.hovered) {
    const { px, py } = at(scene.hovered);
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px + t * 0.05, py + t * 0.05, t * 0.9, t * 0.9, t * 0.16);
    ctx.stroke();

    // Reloj con lo que falta sobre la construcción que está bajo el cursor (o el dedo).
    const lot = scene.lots.find((l) => l.x === scene.hovered!.x && l.y === scene.hovered!.y);
    const endsAt = lot ? building.get(lot.id) : undefined;
    if (endsAt !== undefined) drawClock(ctx, px, py, t, endsAt - now);
  }
}

// El color con el que se pinta el lote: el del dueño, apagado según el estado.
function lotShade(lot: Lot): string {
  if (lot.state === 'abandonado') return ABANDONED;
  const color = lotColor(lot.color);
  return lot.state === 'descuidado' ? desaturate(color, 0.5) : color;
}

// --- Calles ------------------------------------------------------------
// Toda celda que no es lote ni obra es calle. Cada una se dibuja como vereda entera
// más una calzada que se estira hacia las celdas de calle vecinas: así las cuadras
// se encadenan en avenidas continuas en vez de quedar como cuadrados sueltos.
function drawStreets(ctx: CanvasRenderingContext2D, layout: Layout, scene: Scene, theme: Theme) {
  const { tile: t, ox, oy, cols, rows } = layout;
  const built = new Set([...scene.lots, ...scene.works].map((c) => `${c.x},${c.y}`));
  // Fuera de la grilla la calle sigue: así las avenidas salen del tablero en vez de cortarse.
  const isStreet = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows || !built.has(`${x},${y}`);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  const isCrossing = (x: number, y: number) =>
    isStreet(x, y) &&
    [isStreet(x, y - 1), isStreet(x, y + 1), isStreet(x - 1, y), isStreet(x + 1, y)].filter(Boolean).length >= 3;

  const curb = t * 0.17;
  const cells: { x: number; y: number; px: number; py: number; n: boolean; s: boolean; e: boolean; w: boolean }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (built.has(`${x},${y}`)) continue;
      cells.push({
        x,
        y,
        px: ox + x * t,
        py: oy + y * t,
        n: isStreet(x, y - 1),
        s: isStreet(x, y + 1),
        e: isStreet(x + 1, y),
        w: isStreet(x - 1, y),
      });
    }
  }

  // Vereda: la celda entera.
  ctx.fillStyle = theme.sidewalk;
  for (const c of cells) ctx.fillRect(c.px, c.py, t, t);

  // Calzada: se estira hasta el borde por los lados donde la calle sigue.
  ctx.fillStyle = theme.asphalt;
  const r = t * 0.16;
  for (const c of cells) {
    roundRect(
      ctx,
      c.px + (c.w ? 0 : curb),
      c.py + (c.n ? 0 : curb),
      t - (c.w ? 0 : curb) - (c.e ? 0 : curb),
      t - (c.n ? 0 : curb) - (c.s ? 0 : curb),
      // Solo se redondea la esquina que no tiene continuidad por ninguno de sus dos lados.
      [!c.n && !c.w ? r : 0, !c.n && !c.e ? r : 0, !c.s && !c.e ? r : 0, !c.s && !c.w ? r : 0],
    );
    ctx.fill();
  }

  // Cordón: una línea clara al filo de la vereda, del lado que da a los lotes.
  const lip = Math.max(1, t * 0.022);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  for (const c of cells) {
    const across = t - (c.w ? 0 : curb) - (c.e ? 0 : curb);
    const down = t - (c.n ? 0 : curb) - (c.s ? 0 : curb);
    if (!c.n) ctx.fillRect(c.px + (c.w ? 0 : curb), c.py + curb - lip, across, lip);
    if (!c.s) ctx.fillRect(c.px + (c.w ? 0 : curb), c.py + t - curb, across, lip);
    if (!c.w) ctx.fillRect(c.px + curb - lip, c.py + (c.n ? 0 : curb), lip, down);
    if (!c.e) ctx.fillRect(c.px + t - curb, c.py + (c.n ? 0 : curb), lip, down);
  }

  // Línea de eje: dos rayas por celda, con la misma separación dentro y entre celdas.
  const mark = Math.max(1.2, t * 0.03);
  ctx.fillStyle = theme.line;
  for (const c of cells) {
    // En los cruces no se pinta: la raya se corta como en cualquier esquina.
    if ((c.e && c.w) === (c.n && c.s)) continue;
    for (const [a, b] of [
      [0.12, 0.38],
      [0.62, 0.88],
    ]) {
      if (c.e && c.w) ctx.fillRect(c.px + t * a, c.py + t / 2 - mark / 2, t * (b - a), mark);
      else ctx.fillRect(c.px + t / 2 - mark / 2, c.py + t * a, mark, t * (b - a));
    }
  }

  // Sendas peatonales al llegar a un cruce. Recién se leen de cerca.
  if (t >= 34) {
    ctx.fillStyle = 'rgba(255, 252, 240, 0.72)';
    for (const c of cells) {
      if (inside(c.x, c.y - 1) && isCrossing(c.x, c.y - 1)) zebra(ctx, c.px, c.py, t, curb, 'n');
      if (inside(c.x, c.y + 1) && isCrossing(c.x, c.y + 1)) zebra(ctx, c.px, c.py, t, curb, 's');
      if (inside(c.x - 1, c.y) && isCrossing(c.x - 1, c.y)) zebra(ctx, c.px, c.py, t, curb, 'w');
      if (inside(c.x + 1, c.y) && isCrossing(c.x + 1, c.y)) zebra(ctx, c.px, c.py, t, curb, 'e');
    }
  }

  // Arbolitos en la vereda: el sorteo sale del lugar, así que son siempre los mismos.
  if (t >= 26) {
    for (const c of cells) {
      if (isCrossing(c.x, c.y)) continue;
      for (const side of ['n', 's', 'e', 'w'] as const) {
        if (c[side]) continue;
        const h = hash01(`${c.x},${c.y},${side}`);
        if (h > 0.48) continue;
        const along = h < 0.24 ? 0.28 : 0.72;
        const mid = curb / 2;
        const cx = side === 'n' || side === 's' ? c.px + t * along : c.px + (side === 'w' ? mid : t - mid);
        const cy = side === 'e' || side === 'w' ? c.py + t * along : c.py + (side === 'n' ? mid : t - mid);
        drawTree(ctx, cx, cy + curb * 0.4, t * 0.19);
      }
    }
  }
}

// Senda peatonal: cuatro bastones cruzados a la calzada, junto al borde que da al cruce.
function zebra(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  t: number,
  curb: number,
  side: 'n' | 's' | 'e' | 'w',
) {
  const bar = t * 0.04; // ancho de cada bastón
  const step = t * 0.055; // cuánto se repiten hacia adentro
  const edge = t * 0.03;
  const span = t - curb * 2; // la calzada, de cordón a cordón
  for (let i = 0; i < 4; i++) {
    const d = edge + i * step;
    if (side === 'n') ctx.fillRect(px + curb, py + d, span, bar);
    if (side === 's') ctx.fillRect(px + curb, py + t - d - bar, span, bar);
    if (side === 'w') ctx.fillRect(px + d, py + curb, bar, span);
    if (side === 'e') ctx.fillRect(px + t - d - bar, py + curb, bar, span);
  }
}

// Un árbol: tronco y tres copas que se pisan, para que no quede un círculo perfecto.
function drawTree(ctx: CanvasRenderingContext2D, cx: number, baseY: number, size: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(38, 32, 24, 0.14)';
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.16, baseY + size * 0.03, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TRUNK;
  ctx.fillRect(cx - size * 0.07, baseY - size * 0.36, size * 0.14, size * 0.36);
  const copas: [number, number, number, string][] = [
    [-0.24, -0.52, 0.3, FOLIAGE[2]],
    [0.22, -0.5, 0.28, FOLIAGE[0]],
    [-0.02, -0.72, 0.31, FOLIAGE[1]],
  ];
  for (const [dx, dy, r, fill] of copas) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx + size * dx, baseY + size * dy, size * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Terreno del lote --------------------------------------------------
// La parcela es suelo, no una tarjeta: va plana, sin borde ni sombra, y el
// edificio se apoya encima. El color del dueño se ve acá y en las paredes.
function drawParcel(
  ctx: CanvasRenderingContext2D,
  lot: Lot,
  px: number,
  py: number,
  t: number,
  scene: Scene,
  now: number,
) {
  const pad = t * 0.07;
  const s = t - pad * 2;
  const r = t * 0.12;

  if (lot.status === 'cerrado') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
    roundRect(ctx, px + pad, py + pad, s, s, r);
    ctx.fill();
    return;
  }

  if (lot.status === 'libre') {
    const mark = scene.marks?.get(lot.id);
    // Terreno baldío: un verde tenue, para que se lea como lote y no como un hueco.
    ctx.fillStyle = 'rgba(126, 146, 86, 0.12)';
    roundRect(ctx, px + pad, py + pad, s, s, r);
    ctx.fill();
    if (mark === 'suggested') {
      const pulse = 0.5 + 0.5 * Math.sin(now / 350);
      ctx.fillStyle = `rgba(43, 138, 128, ${0.1 + 0.22 * pulse})`;
      roundRect(ctx, px + pad, py + pad, s, s, r);
      ctx.fill();
    } else if (mark === 'claimable') {
      ctx.fillStyle = 'rgba(43, 138, 128, 0.08)';
      roundRect(ctx, px + pad, py + pad, s, s, r);
      ctx.fill();
    }
    const alpha = mark === 'blocked' ? 0.1 : mark ? 0.6 : 0.28;
    ctx.setLineDash([t * 0.08, t * 0.06]);
    ctx.lineWidth = Math.max(1, t * 0.025);
    ctx.strokeStyle = `rgba(59, 58, 54, ${alpha})`;
    roundRect(ctx, px + pad, py + pad, s, s, r);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const color = lotShade(lot);
  ctx.fillStyle = lighten(color, 0.6);
  roundRect(ctx, px + pad, py + pad, s, s, r);
  ctx.fill();
  // El frente del terreno, más claro: parte el piso y deja ver dónde apoya el edificio.
  ctx.fillStyle = lighten(color, 0.76);
  roundRect(ctx, px + pad, py + t * GROUND, s, t * (1 - GROUND) - pad, [0, 0, r, r]);
  ctx.fill();
}

// --- Volumen -----------------------------------------------------------
// Un prisma en tres cuartos. (x, y) es la esquina de adelante a la izquierda,
// al nivel del piso; (dx, dy) es cuánto corre el fondo.
type Box = { x: number; y: number; w: number; h: number; dx: number; dy: number };

const frontFace = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y - b.h],
  [b.x, b.y - b.h],
];
const sideFace = (b: Box): [number, number][] => [
  [b.x + b.w, b.y],
  [b.x + b.w + b.dx, b.y - b.dy],
  [b.x + b.w + b.dx, b.y - b.dy - b.h],
  [b.x + b.w, b.y - b.h],
];
const roofFace = (b: Box): [number, number][] => [
  [b.x, b.y - b.h],
  [b.x + b.dx, b.y - b.dy - b.h],
  [b.x + b.w + b.dx, b.y - b.dy - b.h],
  [b.x + b.w, b.y - b.h],
];
const baseFace = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w + b.dx, b.y - b.dy],
  [b.x + b.dx, b.y - b.dy],
];

function boxOf(type: BuildingType, level: number, px: number, py: number, t: number): Box {
  const s = SHAPE[type];
  const w = t * s.w;
  const dx = t * DEPTH_X;
  return { x: px + (t - w - dx) / 2, y: py + t * GROUND, w, h: t * (s.h + s.step * level), dx, dy: t * DEPTH_Y };
}

// Sombra propia sobre el piso, corrida hacia donde no da la luz.
function castShadow(ctx: CanvasRenderingContext2D, b: Box) {
  const ox = b.h * 0.26;
  const oy = b.h * 0.12;
  ctx.fillStyle = 'rgba(38, 32, 24, 0.15)';
  poly(
    ctx,
    baseFace(b).map(([x, y]) => [x + ox, y + oy] as [number, number]),
  );
  ctx.fill();
}

// Las tres caras. `roof` en null deja el techo para después (los techos a dos aguas).
function volume(ctx: CanvasRenderingContext2D, b: Box, t: number, color: string, roof: string | null) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, t * 0.016);
  ctx.strokeStyle = darken(color, 0.46);
  const caras: [[number, number][], string][] = [
    [sideFace(b), darken(color, 0.18)],
    [frontFace(b), lighten(color, 0.26)],
  ];
  if (roof) caras.unshift([roofFace(b), roof]);
  for (const [pts, fill] of caras) {
    poly(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Pinta sobre el plano del frente: (u, v) con u a la derecha y v hacia abajo desde el alero.
function onFront(ctx: CanvasRenderingContext2D, b: Box, paint: () => void) {
  ctx.save();
  poly(ctx, frontFace(b));
  ctx.clip();
  ctx.translate(b.x, b.y - b.h);
  paint();
  ctx.restore();
}

// Pinta sobre el lado derecho: u va hacia el fondo (0 a dx) y v hacia abajo (0 a h).
function onSide(ctx: CanvasRenderingContext2D, b: Box, paint: () => void) {
  ctx.save();
  poly(ctx, sideFace(b));
  ctx.clip();
  ctx.translate(b.x + b.w, b.y - b.h);
  ctx.transform(1, -b.dy / b.dx, 0, 1, 0, 0);
  paint();
  ctx.restore();
}

// Pinta sobre el techo: u a lo ancho (0 a w) y v hacia el fondo (0 a 1).
function onRoof(ctx: CanvasRenderingContext2D, b: Box, paint: () => void) {
  ctx.save();
  poly(ctx, roofFace(b));
  ctx.clip();
  ctx.transform(1, 0, b.dx, -b.dy, b.x, b.y - b.h);
  paint();
  ctx.restore();
}

// Ventanas del frente: una por nivel, en la banda de arriba. De noche se repintan encendidas.
function windowsOf(level: number, b: Box): { x: number; y: number; w: number; h: number }[] {
  const w = Math.min(b.w * 0.17, b.h * 0.26);
  const h = w * 1.15;
  const y = b.y - b.h + Math.min(b.h * 0.22, b.w * 0.2);
  return Array.from({ length: level }, (_, i) => ({ x: b.x + (b.w * (i + 1)) / (level + 1) - w / 2, y, w, h }));
}

function drawFrontWindows(ctx: CanvasRenderingContext2D, level: number, b: Box, color: string) {
  for (const { x, y, w, h } of windowsOf(level, b)) {
    ctx.fillStyle = darken(color, 0.5);
    roundRect(ctx, x - w * 0.1, y - w * 0.1, w * 1.2, h * 1.14, w * 0.16);
    ctx.fill();
    ctx.fillStyle = GLASS;
    roundRect(ctx, x, y, w, h, w * 0.1);
    ctx.fill();
    // Un brillo en la mitad de arriba: alcanza para que se lea vidrio y no un agujero.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    roundRect(ctx, x, y, w, h * 0.42, [w * 0.1, w * 0.1, 0, 0]);
    ctx.fill();
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, b: Box, color: string, wide: boolean) {
  const w = b.w * (wide ? 0.38 : 0.2);
  const h = Math.min(b.h * 0.4, w * 1.5);
  ctx.fillStyle = darken(color, 0.42);
  roundRect(ctx, b.x + (b.w - w) / 2, b.y - h, w, h, [w * (wide ? 0.5 : 0.22), w * (wide ? 0.5 : 0.22), 0, 0]);
  ctx.fill();
}

// Zócalo: una faja oscura al pie del frente y del lado, para que apoye.
function drawPlinth(ctx: CanvasRenderingContext2D, b: Box, color: string) {
  const h = Math.min(b.h * 0.1, b.w * 0.07);
  ctx.fillStyle = darken(color, 0.3);
  onFront(ctx, b, () => ctx.fillRect(0, b.h - h, b.w, h));
  onSide(ctx, b, () => ctx.fillRect(0, b.h - h, b.dx, h));
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  level: number,
  px: number,
  py: number,
  t: number,
  color: string,
  activo: boolean,
  now: number,
  seed: string,
) {
  if (type === 'plaza') {
    drawPlaza(ctx, level, px, py, t, color);
    return;
  }
  const b = boxOf(type, level, px, py, t);
  castShadow(ctx, b);
  if (type === 'ladrilleria') drawLadrilleria(ctx, b, t, color, activo, now, seed);
  if (type === 'aserradero') drawAserradero(ctx, b, t, color);
  if (type === 'generador') drawGenerador(ctx, b, t, color);
  drawPlinth(ctx, b, color);
  drawDoor(ctx, b, color, type === 'aserradero');
  drawFrontWindows(ctx, level, b, color);
}

// Ladrillería: fábrica de ladrillo a la vista, techo plano con claraboyas y una
// chimenea parada sobre la losa que humea mientras el lote está activo.
function drawLadrilleria(
  ctx: CanvasRenderingContext2D,
  b: Box,
  t: number,
  color: string,
  activo: boolean,
  now: number,
  seed: string,
) {
  volume(ctx, b, t, color, darken(color, 0.34));

  // Hiladas de ladrillo en las dos caras, trabadas una fila sí y otra no.
  const courses = 6;
  const gap = b.h / courses;
  const joint = Math.max(0.6, b.h * 0.012);
  const rows = (width: number) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (let i = 1; i < courses; i++) ctx.fillRect(0, gap * i, width, joint);
    ctx.fillStyle = 'rgba(38, 32, 24, 0.1)';
    for (let i = 0; i < courses; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillRect(width * (i % 2 ? 0.14 : 0.28) + (width * j) / 4, gap * i, joint, gap);
      }
    }
  };
  onFront(ctx, b, () => rows(b.w));
  onSide(ctx, b, () => rows(b.dx));

  // Claraboyas: dos fajas de vidrio sobre la losa.
  onRoof(ctx, b, () => {
    ctx.fillStyle = 'rgba(159, 192, 204, 0.85)';
    ctx.fillRect(b.w * 0.12, 0.18, b.w * 0.76, 0.2);
    ctx.fillRect(b.w * 0.12, 0.56, b.w * 0.76, 0.2);
  });

  // Parapeto: la losa termina en una faja sobre el frente y el lado.
  const pp = Math.max(1.5, t * 0.022);
  ctx.fillStyle = lighten(color, 0.06);
  onFront(ctx, b, () => ctx.fillRect(0, 0, b.w, pp));
  ctx.fillStyle = darken(color, 0.24);
  onSide(ctx, b, () => ctx.fillRect(0, 0, b.dx, pp));

  // Chimenea, parada al fondo de la losa.
  const v = 0.68;
  const cw = b.w * 0.15;
  const ch: Box = {
    x: b.x + b.w * (hash01(seed) < 0.5 ? 0.1 : 0.7) + b.dx * v,
    y: b.y - b.h - b.dy * v,
    w: cw,
    h: t * 0.24,
    dx: b.dx * 0.3,
    dy: b.dy * 0.3,
  };
  volume(ctx, ch, t, darken(color, 0.06), lighten(color, 0.2));

  if (!activo) return;
  // Tres bocanadas que suben y se abren. El ciclo es largo: no distrae.
  ctx.save();
  const top = ch.y - ch.h - ch.dy * 0.5;
  for (let i = 0; i < 3; i++) {
    const phase = (now / 3400 + i / 3) % 1;
    ctx.globalAlpha = 0.34 * (1 - phase);
    ctx.fillStyle = '#f6f2e8';
    ctx.beginPath();
    ctx.arc(
      ch.x + cw * 0.6 + t * 0.05 * phase,
      top - t * 0.02 - t * 0.11 * phase,
      t * (0.03 + 0.028 * phase),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

// Aserradero: galpón de madera con el techo a dos aguas de punta al frente,
// tablas verticales, óculo en el frontón y troncos apilados al costado.
function drawAserradero(ctx: CanvasRenderingContext2D, b: Box, t: number, color: string) {
  const roofColor = darken(color, 0.36);
  const rise = b.w * 0.42; // cuánto sube la cumbrera sobre el alero
  const over = b.w * 0.07; // vuelo del alero
  const top = b.y - b.h;
  const ridge: [number, number] = [b.x + b.w / 2, top - rise];

  // Troncos apilados al costado, sobre el terreno.
  const lr = t * 0.036;
  for (const [cx, cy] of [
    [b.x - lr * 1.2, b.y - lr],
    [b.x - lr * 3, b.y - lr],
    [b.x - lr * 2.1, b.y - lr * 2.7],
  ]) {
    ctx.fillStyle = TRUNK;
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lighten(TRUNK, 0.38);
    ctx.beginPath();
    ctx.arc(cx, cy, lr * 0.44, 0, Math.PI * 2);
    ctx.fill();
  }

  volume(ctx, b, t, color, null);

  // Tablas verticales en las dos caras.
  const planks = (width: number, n: number) => {
    ctx.fillStyle = 'rgba(38, 32, 24, 0.13)';
    for (let i = 1; i < n; i++) ctx.fillRect((width * i) / n, 0, Math.max(0.6, b.w * 0.012), b.h);
  };
  onFront(ctx, b, () => planks(b.w, 7));
  onSide(ctx, b, () => planks(b.dx, 4));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, t * 0.016);
  ctx.strokeStyle = darken(color, 0.46);

  // El agua derecha del techo, que se va con el fondo.
  poly(ctx, [
    ridge,
    [ridge[0] + b.dx, ridge[1] - b.dy],
    [b.x + b.w + over + b.dx, top - b.dy],
    [b.x + b.w + over, top],
  ]);
  ctx.fillStyle = roofColor;
  ctx.fill();
  ctx.stroke();

  // Frontón: la pared triangular que mira al frente.
  poly(ctx, [[b.x - over, top], ridge, [b.x + b.w + over, top]]);
  ctx.fillStyle = lighten(color, 0.34);
  ctx.fill();
  ctx.stroke();

  // Tapacantos: las dos fajas del alero, que son las que dibujan la silueta.
  ctx.strokeStyle = roofColor;
  ctx.lineWidth = t * 0.03;
  ctx.beginPath();
  ctx.moveTo(b.x - over, top);
  ctx.lineTo(ridge[0], ridge[1]);
  ctx.lineTo(b.x + b.w + over, top);
  ctx.stroke();
  ctx.restore();

  // Óculo del frontón, por donde se sube la madera.
  ctx.fillStyle = darken(color, 0.44);
  ctx.beginPath();
  ctx.arc(ridge[0], ridge[1] + rise * 0.48, b.w * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// Generador: usina angosta y alta, losa con dos chimeneas cortas y el cartel del rayo.
function drawGenerador(ctx: CanvasRenderingContext2D, b: Box, t: number, color: string) {
  volume(ctx, b, t, color, darken(color, 0.34));

  // Dos chimeneas paradas sobre la losa.
  for (const [u, v] of [
    [0.14, 0.52],
    [0.56, 0.74],
  ]) {
    const cw = b.w * 0.18;
    volume(
      ctx,
      {
        x: b.x + b.w * u + b.dx * v,
        y: b.y - b.h - b.dy * v,
        w: cw,
        h: t * 0.11,
        dx: b.dx * 0.28,
        dy: b.dy * 0.28,
      },
      t,
      darken(color, 0.08),
      lighten(color, 0.18),
    );
  }

  // Parapeto de la losa.
  const pp = Math.max(1.5, t * 0.022);
  ctx.fillStyle = lighten(color, 0.06);
  onFront(ctx, b, () => ctx.fillRect(0, 0, b.w, pp));
  ctx.fillStyle = darken(color, 0.24);
  onSide(ctx, b, () => ctx.fillRect(0, 0, b.dx, pp));

  // Cartel del rayo, montado sobre el parapeto: el frente de la usina es angosto
  // y abajo ya están las ventanas y la puerta.
  const r = Math.min(b.w * 0.24, t * 0.06);
  const cx = b.x + b.w / 2;
  const cy = b.y - b.h - r * 0.5;
  ctx.fillStyle = darken(color, 0.4);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const bolt: [number, number][] = [
    [0.6, 0],
    [0.12, 0.56],
    [0.42, 0.56],
    [0.32, 1],
    [0.88, 0.4],
    [0.54, 0.4],
  ];
  ctx.save();
  ctx.fillStyle = '#ffd257';
  ctx.strokeStyle = '#ffd257';
  ctx.lineWidth = r * 0.2;
  ctx.lineJoin = 'round';
  poly(
    ctx,
    bolt.map(([bx, by]) => [cx - r * 0.6 + r * 1.2 * bx, cy - r * 0.66 + r * 1.32 * by] as [number, number]),
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Plaza: el lote no se edifica. Cantero con camino, un kiosco en el medio y un árbol por nivel.
function drawPlaza(ctx: CanvasRenderingContext2D, level: number, px: number, py: number, t: number, color: string) {
  ctx.fillStyle = mix('#93b45c', color, 0.2);
  roundRect(ctx, px + t * 0.14, py + t * 0.2, t * 0.72, t * 0.64, t * 0.24);
  ctx.fill();

  // Camino que la cruza.
  ctx.fillStyle = 'rgba(243, 236, 218, 0.8)';
  roundRect(ctx, px + t * 0.14, py + t * 0.73, t * 0.72, t * 0.09, t * 0.045);
  ctx.fill();

  const arboles: [number, number, number][] = [
    [0.25, 0.7, 0.22],
    [0.77, 0.66, 0.19],
    [0.63, 0.84, 0.16],
  ];
  for (let i = 0; i < Math.min(level, 3); i++) {
    const [fx, fy, size] = arboles[i];
    drawTree(ctx, px + t * fx, py + t * fy, t * size);
  }

  drawKiosco(ctx, px + t * 0.48, py + t * 0.72, t * (0.24 + level * 0.025), t, darken(color, 0.36));
}

// Kiosco de la plaza: tarima, cuatro columnas y techo a cuatro aguas.
// Mismo punto de vista que los edificios: se ven dos faldones, no un triángulo plano.
function drawKiosco(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, t: number, roof: string) {
  const rw = w * 0.52; // medio ancho del techo
  const rd = w * 0.22; // cuánto se abre hacia adelante y hacia atrás
  const h = w * 0.44; // alto de las columnas

  ctx.fillStyle = 'rgba(38, 32, 24, 0.15)';
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.12, baseY + w * 0.02, w * 0.5, w * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tarima.
  ctx.fillStyle = '#e2d7bd';
  poly(ctx, [
    [cx - rw * 0.78, baseY],
    [cx, baseY + rd * 0.8],
    [cx + rw * 0.78, baseY],
    [cx, baseY - rd * 0.8],
  ]);
  ctx.fill();

  ctx.fillStyle = '#f8f2e3';
  for (const [dx, dy] of [
    [-0.58, 0.08],
    [-0.08, 0.46],
    [0.58, 0.08],
    [0.08, -0.34],
  ]) {
    ctx.fillRect(cx + rw * dx - w * 0.045, baseY + rd * dy - h, w * 0.09, h);
  }

  // Techo a cuatro aguas: se ven el faldón de adelante a la izquierda y el de la derecha.
  const eave = baseY - h;
  const left: [number, number] = [cx - rw, eave];
  const front: [number, number] = [cx, eave + rd];
  const right: [number, number] = [cx + rw, eave];
  const apex: [number, number] = [cx, eave - w * 0.34];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, t * 0.014);
  ctx.strokeStyle = darken(roof, 0.25);
  poly(ctx, [left, front, apex]);
  ctx.fillStyle = lighten(roof, 0.14);
  ctx.fill();
  ctx.stroke();
  poly(ctx, [front, right, apex]);
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.arc(apex[0], apex[1] - w * 0.04, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

// De noche: las mismas ventanas encendidas, o faroles si el lote es una plaza.
function drawNightLights(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  level: number,
  px: number,
  py: number,
  t: number,
) {
  ctx.save();
  ctx.fillStyle = '#ffd866';
  ctx.shadowColor = 'rgba(255, 210, 90, 0.9)';
  ctx.shadowBlur = t * 0.16;

  if (type === 'plaza') {
    const faroles: [number, number][] = [
      [0.19, 0.58],
      [0.81, 0.56],
      [0.48, 0.46],
    ];
    for (let i = 0; i < Math.min(level, 3); i++) {
      ctx.beginPath();
      ctx.arc(px + t * faroles[i][0], py + t * faroles[i][1], Math.max(1.6, t * 0.032), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  for (const { x, y, w, h } of windowsOf(level, boxOf(type, level, px, py, t))) {
    roundRect(ctx, x, y, w, h, w * 0.1);
    ctx.fill();
  }
  ctx.restore();
}

// --- Estado del lote ---------------------------------------------------
// Lote descuidado: pasto crecido en la base (docs/07, "El canvas").
function drawGrass(ctx: CanvasRenderingContext2D, px: number, py: number, t: number) {
  const base = py + t * 0.9;
  ctx.save();
  ctx.strokeStyle = '#6f7d3a';
  ctx.lineWidth = Math.max(1.2, t * 0.026);
  ctx.lineCap = 'round';
  [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].forEach((d, i) => {
    const x = px + t / 2 + d * t;
    const h = t * (i % 2 ? 0.09 : 0.14);
    const lean = (i % 2 ? 1 : -1) * t * 0.04;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + lean * 0.5, base - h * 0.6, x + lean, base - h);
    ctx.stroke();
  });
  ctx.restore();
}

// Lote abandonado: una mano en una chapita, para que el vecino vea que puede cuidarlo.
// Los dedos van verticales y rectos: a este tamaño, redondeados se confunden con otras formas.
function drawCare(ctx: CanvasRenderingContext2D, px: number, py: number, t: number) {
  const r = Math.max(9, t * 0.19);
  const cx = px + t - r - t * 0.04;
  const cy = py + r + t * 0.04;
  ctx.save();
  softShadow(ctx, r * 0.5, r * 0.12, 0.28);
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  clearShadow(ctx);

  ctx.fillStyle = '#fff';
  const w = r * 0.17; // ancho de cada dedo
  const gap = r * 0.075;
  const heights = [0.46, 0.58, 0.5, 0.34]; // índice, mayor, anular, meñique
  const left = cx - (4 * w + 3 * gap) / 2 + r * 0.06; // corrido a la derecha: el pulgar ocupa la izquierda
  heights.forEach((h, i) => {
    const x = left + i * (w + gap);
    roundRect(ctx, x, cy + r * 0.1 - r * h, w, r * h, w / 2);
    ctx.fill();
  });

  // Pulgar: el mismo dedo, apoyado en diagonal sobre el costado de la palma.
  ctx.save();
  ctx.translate(left - gap, cy + r * 0.1);
  ctx.rotate(-Math.PI / 2.6);
  roundRect(ctx, -w, 0, w, r * 0.42, w / 2);
  ctx.fill();
  ctx.restore();

  // Palma.
  roundRect(ctx, left - w * 0.7, cy, 4 * w + 3 * gap + w * 1.2, r * 0.52, r * 0.16);
  ctx.fill();
  ctx.restore();
}

// Dos trazos que dan una vuelta al lote cada 4 segundos.
function drawWorking(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, now: number) {
  const pad = t * 0.05;
  const s = t - pad * 2;
  const r = t * 0.16;
  const perimeter = 4 * (s - 2 * r) + 2 * Math.PI * r;
  const seg = perimeter * 0.16;
  ctx.save();
  ctx.lineWidth = Math.max(2, t * 0.045);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  roundRect(ctx, px + pad, py + pad, s, s, r);
  ctx.stroke();
  ctx.strokeStyle = WORKING;
  ctx.setLineDash([seg, perimeter / 2 - seg]);
  ctx.lineDashOffset = -((now % 4000) / 4000) * perimeter;
  ctx.stroke();
  ctx.restore();
}

// Pastilla con un reloj y el tiempo restante, arriba del lote (abajo si no entra).
function drawClock(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, left: number) {
  const text = formatRemaining(left);
  const fs = Math.max(11, Math.round(t * 0.2));
  ctx.save();
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const r = fs * 0.45;
  const h = fs * 1.7;
  const w = fs * 0.5 + r * 2 + fs * 0.4 + ctx.measureText(text).width + fs * 0.6;
  const x = Math.max(4, Math.min(px + t / 2 - w / 2, ctx.canvas.clientWidth - w - 4));
  const above = py - h - t * 0.06;
  const y = above >= 4 ? above : py + t + t * 0.06;

  softShadow(ctx, fs * 0.6, fs * 0.15, 0.3);
  ctx.fillStyle = 'rgba(30, 30, 28, 0.92)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  clearShadow(ctx);

  const cx = x + fs * 0.5 + r;
  const cy = y + h / 2;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.2, fs * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.65);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.5, cy);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx + r + fs * 0.4, cy + 1);
  ctx.restore();
}

// --- Obra pública ------------------------------------------------------
// La plataforma va con el suelo; el edificio, con el resto de los volúmenes.
function drawWorkPlate(ctx: CanvasRenderingContext2D, work: PublicWork, px: number, py: number, t: number) {
  const out = t * 0.05;
  const s = t + out * 2;
  const done = work.status === 'completada';
  ctx.save();
  ctx.fillStyle = done ? '#f1e6c0' : '#e7e0ce';
  roundRect(ctx, px - out, py - out, s, s, t * 0.14);
  ctx.fill();
  ctx.strokeStyle = done ? '#b4922c' : '#8d8676';
  ctx.lineWidth = Math.max(1, t * 0.03);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  roundRect(ctx, px - out + t * 0.07, py - out + t * 0.07, s - t * 0.14, s - t * 0.14, t * 0.09);
  ctx.stroke();
  ctx.restore();
}

// Edificio cívico: escalinata, columnas y frontón, en el mismo punto de vista.
function drawWorkBuilding(ctx: CanvasRenderingContext2D, work: PublicWork, px: number, py: number, t: number) {
  const done = work.status === 'completada';
  const stone = '#f3ecd9';
  const trim = done ? '#c2a047' : '#a39a86';
  const w = t * 0.46;
  const dx = t * DEPTH_X;
  const b: Box = { x: px + (t - w - dx) / 2, y: py + t * 0.74, w, h: t * 0.24, dx, dy: t * DEPTH_Y };

  castShadow(ctx, b);
  volume(ctx, b, t, stone, null);

  // Columnas en el frente.
  onFront(ctx, b, () => {
    ctx.fillStyle = trim;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(b.w * 0.1 + (i * b.w * 0.72) / 4, b.h * 0.16, b.w * 0.09, b.h * 0.72);
    }
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, t * 0.016);
  ctx.strokeStyle = darken(stone, 0.42);

  // Techo: el agua derecha y el frontón, como en el aserradero pero de piedra.
  const top = b.y - b.h;
  const rise = b.w * 0.34;
  const over = b.w * 0.09;
  const ridge: [number, number] = [b.x + b.w / 2, top - rise];
  poly(ctx, [ridge, [ridge[0] + b.dx, ridge[1] - b.dy], [b.x + b.w + over + b.dx, top - b.dy], [b.x + b.w + over, top]]);
  ctx.fillStyle = darken(stone, 0.24);
  ctx.fill();
  ctx.stroke();
  poly(ctx, [[b.x - over, top], ridge, [b.x + b.w + over, top]]);
  ctx.fillStyle = stone;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Escalinata al frente.
  ctx.fillStyle = darken(stone, 0.16);
  roundRect(ctx, b.x - t * 0.02, b.y, b.w + t * 0.04, t * 0.03, t * 0.01);
  ctx.fill();

  // Barra de progreso, al pie de la plataforma.
  const pw = t * 0.78;
  const ph = Math.max(3, t * 0.075);
  const bx = px + (t - pw) / 2;
  const by = py + t * 0.85;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  roundRect(ctx, bx, by, pw, ph, ph / 2);
  ctx.fill();
  ctx.fillStyle = done ? '#c9a227' : ACCENT;
  roundRect(ctx, bx, by, Math.max(ph, (pw * workPercent(work)) / 100), ph, ph / 2);
  ctx.fill();
}

// Barrios cerrados: casi invisibles, con el nombre en gris y "se abre pronto".
function drawClosedBarrios(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout, ink: string) {
  const { tile: t, ox, oy } = layout;
  for (const barrio of scene.barrios) {
    if (barrio.status !== 'cerrado') continue;
    const cells = scene.lots.filter((l) => l.barrio_id === barrio.id);
    if (cells.length === 0) continue;
    const minX = Math.min(...cells.map((c) => c.x));
    const maxX = Math.max(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    // Arriba del barrio, para no tapar la obra pública que queda en el medio.
    const cx = ox + ((minX + maxX + 1) / 2) * t;
    const cy = oy + (minY + 1.5) * t;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(t * 0.24)}px system-ui, sans-serif`;
    ctx.fillText(barrio.name, cx, cy - t * 0.16);
    ctx.font = `${Math.round(t * 0.17)}px system-ui, sans-serif`;
    ctx.fillText('se abre pronto', cx, cy + t * 0.16);
    ctx.restore();
  }
}
