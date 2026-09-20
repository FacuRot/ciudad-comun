// Dibuja la ciudad entera en cada cuadro. Sin optimizaciones: son ~100 celdas.
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

  for (const lot of scene.lots) {
    const { px, py } = at(lot);
    drawLot(ctx, lot, px, py, t, scene, now);
  }
  for (const work of scene.works) {
    const { px, py } = at(work);
    drawWork(ctx, work, px, py, t);
  }

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
    ctx.fillText(work.name, px + t / 2, py + t * 0.14);
    ctx.restore();
  }
  drawClosedBarrios(ctx, scene, layout, theme.ink);

  for (const id of [scene.myLotId, scene.selectedLotId]) {
    const lot = id ? scene.lots.find((l) => l.id === id) : null;
    if (!lot) continue;
    const { px, py } = at(lot);
    ctx.strokeStyle = id === scene.selectedLotId ? ACCENT : theme.ink;
    ctx.lineWidth = Math.max(2, t * 0.05);
    roundRect(ctx, px + t * 0.03, py + t * 0.03, t * 0.94, t * 0.94, t * 0.2);
    ctx.stroke();
  }

  const selectedWork = scene.selectedWorkId ? scene.works.find((w) => w.id === scene.selectedWorkId) : null;
  if (selectedWork) {
    const { px, py } = at(selectedWork);
    const out = t * 0.05;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, t * 0.05);
    roundRect(ctx, px - out, py - out, t + out * 2, t + out * 2, t * 0.16);
    ctx.stroke();
  }

  if (scene.hovered) {
    const { px, py } = at(scene.hovered);
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px + t * 0.03, py + t * 0.03, t * 0.94, t * 0.94, t * 0.2);
    ctx.stroke();

    // Reloj con lo que falta sobre la construcción que está bajo el cursor (o el dedo).
    const lot = scene.lots.find((l) => l.x === scene.hovered!.x && l.y === scene.hovered!.y);
    const endsAt = lot ? building.get(lot.id) : undefined;
    if (endsAt !== undefined) drawClock(ctx, px, py, t, endsAt - now);
  }
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
  ctx.ellipse(cx, baseY, size * 0.34, size * 0.11, 0, 0, Math.PI * 2);
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

// --- Lotes -------------------------------------------------------------
// Dos trazos que dan una vuelta al lote cada 4 segundos.
function drawWorking(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, now: number) {
  const pad = t * 0.06;
  const s = t - pad * 2;
  const r = t * 0.18;
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

function drawLot(ctx: CanvasRenderingContext2D, lot: Lot, px: number, py: number, t: number, scene: Scene, now: number) {
  const pad = t * 0.06;
  const s = t - pad * 2;
  const r = t * 0.2;

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

  // Ocupado: el terreno en el color del dueño, y el edificio más grande cuanto más nivel.
  let color = lotColor(lot.color);
  if (lot.state === 'descuidado') color = desaturate(color, 0.5);
  if (lot.state === 'abandonado') color = ABANDONED;

  ctx.save();
  softShadow(ctx, t * 0.12, t * 0.03, 0.16);
  const plot = ctx.createLinearGradient(0, py + pad, 0, py + pad + s);
  plot.addColorStop(0, lighten(color, 0.74));
  plot.addColorStop(1, lighten(color, 0.52));
  ctx.fillStyle = plot;
  roundRect(ctx, px + pad, py + pad, s, s, r);
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = lighten(color, 0.1);
  ctx.lineWidth = Math.max(1, t * 0.028);
  ctx.stroke();

  // Lo que se dibuje adentro queda recortado al lote: ni el humo ni un techo se derraman al vecino.
  roundRect(ctx, px + pad, py + pad, s, s, r);
  ctx.clip();
  if (lot.level > 0 && lot.building_type) {
    drawBuilding(ctx, lot.building_type, lot.level, px, py, t, color, lot.state === 'activo', now, lot.id);
  }
  ctx.restore();
}

// --- Edificios ---------------------------------------------------------
// Cada oficio es un edificio, no un objeto: paredes, techo, puerta y ventanas.
// Lo que cambia entre uno y otro es la silueta y los detalles del oficio.
type Facade = { x: number; y: number; w: number; h: number };

// Huella del frente: el ancho lo fija el oficio y el alto crece con el nivel.
const FOOTPRINT: Record<BuildingType, { w: number; base: number; step: number }> = {
  ladrilleria: { w: 0.74, base: 0.26, step: 0.07 }, // fábrica ancha
  aserradero: { w: 0.64, base: 0.22, step: 0.07 }, // galpón
  generador: { w: 0.54, base: 0.28, step: 0.09 }, // usina angosta y alta
  plaza: { w: 0.7, base: 0, step: 0 },
};
// Altura del lote donde se apoyan todos los edificios: los alinea entre vecinos.
const GROUND = 0.8;

function facadeOf(type: BuildingType, level: number, px: number, py: number, t: number): Facade {
  const { w: fw, base, step } = FOOTPRINT[type];
  const w = t * fw;
  const h = t * (base + step * level);
  return { x: px + (t - w) / 2, y: py + t * GROUND - h, w, h };
}

// Ventanas del frente: una por nivel, en la banda de arriba. De noche se repintan encendidas.
function windowsOf(level: number, f: Facade): { x: number; y: number; s: number }[] {
  const s = Math.min(f.h * 0.24, f.w * 0.16);
  const y = f.y + f.h * 0.2;
  return Array.from({ length: level }, (_, i) => ({ x: f.x + (f.w * (i + 1)) / (level + 1) - s / 2, y, s }));
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

  const f = facadeOf(type, level, px, py, t);
  // Sombra en el piso: apoya el edificio sobre el lote.
  ctx.fillStyle = 'rgba(38, 32, 24, 0.16)';
  ctx.beginPath();
  ctx.ellipse(px + t / 2, f.y + f.h, f.w * 0.58, t * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();

  if (type === 'ladrilleria') drawLadrilleria(ctx, f, py, t, color, activo, now, seed);
  if (type === 'aserradero') drawAserradero(ctx, f, t, color);
  if (type === 'generador') drawGenerador(ctx, f, t, color);

  drawPlinth(ctx, f, t, color);
  drawDoor(ctx, f, t, color, type === 'aserradero');
  drawWindows(ctx, level, f, color);
}

// Paredes: un poco de luz arriba y sombra abajo, con las esquinas apenas redondeadas.
function walls(ctx: CanvasRenderingContext2D, f: Facade, color: string, r: number) {
  const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  g.addColorStop(0, lighten(color, 0.16));
  g.addColorStop(1, darken(color, 0.1));
  ctx.fillStyle = g;
  roundRect(ctx, f.x, f.y, f.w, f.h, [r, r, r * 0.4, r * 0.4]);
  ctx.fill();
}

// Zócalo: una faja oscura al pie, para que el edificio no flote.
function drawPlinth(ctx: CanvasRenderingContext2D, f: Facade, t: number, color: string) {
  const h = Math.max(1.5, t * 0.022);
  ctx.fillStyle = darken(color, 0.26);
  ctx.fillRect(f.x, f.y + f.h - h, f.w, h);
}

function drawDoor(ctx: CanvasRenderingContext2D, f: Facade, t: number, color: string, porton: boolean) {
  const w = f.w * (porton ? 0.34 : 0.22);
  const h = f.h * (porton ? 0.46 : 0.4);
  const x = f.x + (f.w - w) / 2;
  const y = f.y + f.h - h;
  ctx.fillStyle = darken(color, 0.4);
  roundRect(ctx, x, y, w, h, [w * (porton ? 0.5 : 0.24), w * (porton ? 0.5 : 0.24), 0, 0]);
  ctx.fill();
  if (porton) {
    // Las dos tablas cruzadas del portón del galpón.
    ctx.save();
    roundRect(ctx, x, y, w, h, [w * 0.5, w * 0.5, 0, 0]);
    ctx.clip();
    ctx.strokeStyle = lighten(color, 0.2);
    ctx.lineWidth = Math.max(1, t * 0.014);
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.35);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y + h * 0.35);
    ctx.lineTo(x, y + h);
    ctx.stroke();
    ctx.restore();
  }
}

function drawWindows(ctx: CanvasRenderingContext2D, level: number, f: Facade, color: string) {
  for (const { x, y, s } of windowsOf(level, f)) {
    ctx.fillStyle = darken(color, 0.44);
    roundRect(ctx, x, y, s, s, s * 0.2);
    ctx.fill();
    // Un reflejo arriba: alcanza para que se lea vidrio y no un agujero.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    roundRect(ctx, x, y, s, s * 0.44, [s * 0.2, s * 0.2, 0, 0]);
    ctx.fill();
  }
}

// Ladrillería: fábrica ancha de ladrillo a la vista, techo en diente de sierra
// y una chimenea que humea mientras el lote está activo.
function drawLadrilleria(
  ctx: CanvasRenderingContext2D,
  f: Facade,
  py: number,
  t: number,
  color: string,
  activo: boolean,
  now: number,
  seed: string,
) {
  const roof = darken(color, 0.34);
  const chw = t * 0.1;
  const chx = f.x + (hash01(seed) < 0.5 ? f.w * 0.08 : f.w * 0.8);
  // La chimenea arranca siempre a la misma altura: así el humo tiene lugar en todos los niveles.
  const chTop = py + t * 0.16;

  ctx.fillStyle = roof;
  roundRect(ctx, chx, chTop, chw, f.y + f.h * 0.5 - chTop, [chw * 0.3, chw * 0.3, 0, 0]);
  ctx.fill();
  ctx.fillStyle = lighten(color, 0.28);
  roundRect(ctx, chx - chw * 0.16, chTop, chw * 1.32, chw * 0.34, chw * 0.15);
  ctx.fill();

  // Techo en diente de sierra: tres dientes, la silueta que dice "fábrica".
  const th = t * 0.075;
  const tw = f.w / 3;
  ctx.save();
  ctx.fillStyle = roof;
  ctx.strokeStyle = roof;
  ctx.lineWidth = t * 0.022;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(f.x + i * tw, f.y - th);
    ctx.lineTo(f.x + (i + 1) * tw, f.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  walls(ctx, f, color, t * 0.03);

  // Hiladas de ladrillo, trabadas una fila sí y otra no.
  ctx.save();
  roundRect(ctx, f.x, f.y, f.w, f.h, t * 0.03);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = Math.max(0.8, t * 0.012);
  const courses = 5;
  for (let i = 1; i <= courses; i++) {
    const ly = f.y + (f.h * i) / courses;
    ctx.beginPath();
    ctx.moveTo(f.x, ly);
    ctx.lineTo(f.x + f.w, ly);
    ctx.stroke();
    for (let j = 0; j < 4; j++) {
      const lx = f.x + f.w * (i % 2 ? 0.12 : 0.24) + (f.w * j) / 4;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly - f.h / courses);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Cornisa: separa la pared del techo.
  ctx.fillStyle = roof;
  ctx.fillRect(f.x - f.w * 0.03, f.y - t * 0.012, f.w * 1.06, t * 0.028);

  if (!activo) return;
  // Tres bocanadas que suben y se abren. El ciclo es largo: no distrae.
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const phase = (now / 3400 + i / 3) % 1;
    ctx.globalAlpha = 0.34 * (1 - phase);
    ctx.fillStyle = '#f6f2e8';
    ctx.beginPath();
    ctx.arc(chx + chw * 0.5 + t * 0.06 * phase, chTop - t * 0.03 - t * 0.1 * phase, t * (0.035 + 0.03 * phase), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Aserradero: galpón de madera con techo a dos aguas, portón y tablas verticales.
function drawAserradero(ctx: CanvasRenderingContext2D, f: Facade, t: number, color: string) {
  const roof = darken(color, 0.36);
  const apex = f.y - t * 0.2;
  const eave = f.w * 0.1; // alero

  // Frontón: la pared del triángulo, del mismo color que el resto.
  ctx.fillStyle = lighten(color, 0.1);
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x + f.w / 2, apex);
  ctx.lineTo(f.x + f.w, f.y);
  ctx.closePath();
  ctx.fill();

  // Las dos aguas, como fajas gruesas de punta redondeada.
  ctx.save();
  ctx.strokeStyle = roof;
  ctx.lineWidth = t * 0.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(f.x - eave, f.y + t * 0.025);
  ctx.lineTo(f.x + f.w / 2, apex);
  ctx.lineTo(f.x + f.w + eave, f.y + t * 0.025);
  ctx.stroke();
  ctx.restore();

  // Óculo del frontón, por donde se sube la madera.
  ctx.fillStyle = darken(color, 0.42);
  ctx.beginPath();
  ctx.arc(f.x + f.w / 2, apex + t * 0.088, t * 0.032, 0, Math.PI * 2);
  ctx.fill();

  walls(ctx, f, color, t * 0.025);

  // Tablas verticales.
  ctx.save();
  roundRect(ctx, f.x, f.y, f.w, f.h, t * 0.025);
  ctx.clip();
  ctx.strokeStyle = 'rgba(38, 32, 24, 0.14)';
  ctx.lineWidth = Math.max(0.8, t * 0.012);
  for (let i = 1; i < 7; i++) {
    const lx = f.x + (f.w * i) / 7;
    ctx.beginPath();
    ctx.moveTo(lx, f.y);
    ctx.lineTo(lx, f.y + f.h);
    ctx.stroke();
  }
  ctx.restore();

  // Troncos apilados contra la pared: el oficio, al costado del edificio.
  const lr = t * 0.038;
  const base = f.y + f.h;
  for (const [cx, cy] of [
    [f.x + f.w + lr * 0.4, base - lr],
    [f.x + f.w + lr * 2.2, base - lr],
    [f.x + f.w + lr * 1.3, base - lr * 2.7],
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
}

// Generador: usina angosta con losa, dos chimeneas cortas y el cartel del rayo.
function drawGenerador(ctx: CanvasRenderingContext2D, f: Facade, t: number, color: string) {
  const roof = darken(color, 0.34);

  for (const dx of [0.2, 0.62]) {
    ctx.fillStyle = roof;
    roundRect(ctx, f.x + f.w * dx, f.y - t * 0.095, f.w * 0.18, t * 0.12, [f.w * 0.06, f.w * 0.06, 0, 0]);
    ctx.fill();
    ctx.fillStyle = lighten(color, 0.28);
    roundRect(ctx, f.x + f.w * dx - f.w * 0.03, f.y - t * 0.095, f.w * 0.24, t * 0.028, t * 0.012);
    ctx.fill();
  }

  walls(ctx, f, color, t * 0.03);

  // Parapeto de la losa.
  ctx.fillStyle = roof;
  roundRect(ctx, f.x - f.w * 0.05, f.y - t * 0.022, f.w * 1.1, t * 0.05, t * 0.02);
  ctx.fill();

  // Cartel redondo con el rayo, montado sobre el parapeto.
  const r = t * 0.058;
  const cx = f.x + f.w / 2;
  const cy = f.y - t * 0.022 - r * 0.7;
  ctx.fillStyle = roof;
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
  ctx.lineWidth = r * 0.18;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  bolt.forEach(([bx, by], i) => {
    const x = cx - r * 0.62 + r * 1.24 * bx;
    const y = cy - r * 0.68 + r * 1.36 * by;
    return i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Plaza: el lote no se edifica. Cantero con camino, un kiosco en el medio y un árbol por nivel.
function drawPlaza(ctx: CanvasRenderingContext2D, level: number, px: number, py: number, t: number, color: string) {
  ctx.fillStyle = mix('#93b45c', color, 0.2);
  roundRect(ctx, px + t * 0.15, py + t * 0.2, t * 0.7, t * 0.62, t * 0.26);
  ctx.fill();

  // Camino que la cruza.
  ctx.fillStyle = 'rgba(243, 236, 218, 0.8)';
  roundRect(ctx, px + t * 0.15, py + t * 0.67, t * 0.7, t * 0.1, t * 0.05);
  ctx.fill();

  const arboles: [number, number, number][] = [
    [0.27, 0.62, 0.24],
    [0.74, 0.6, 0.21],
    [0.6, 0.79, 0.18],
  ];
  for (let i = 0; i < Math.min(level, 3); i++) {
    const [fx, fy, size] = arboles[i];
    drawTree(ctx, px + t * fx, py + t * fy, t * size);
  }

  drawKiosco(ctx, px + t * 0.5, py + t * 0.64, t * (0.26 + level * 0.03), darken(color, 0.34));
}

// Kiosco de la plaza: tarima, cuatro columnas y un techo que vuela por encima.
// Sin baranda: con baranda se lee como una cerca y no como una construcción.
function drawKiosco(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, roof: string) {
  const h = w * 0.42; // alto de las columnas
  ctx.fillStyle = 'rgba(38, 32, 24, 0.14)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, w * 0.56, w * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tarima.
  ctx.fillStyle = '#ece2cb';
  roundRect(ctx, cx - w * 0.46, baseY - w * 0.1, w * 0.92, w * 0.14, w * 0.05);
  ctx.fill();

  ctx.fillStyle = '#f8f2e3';
  for (const dx of [-0.34, -0.13, 0.13, 0.34]) {
    ctx.fillRect(cx + w * dx - w * 0.05, baseY - h, w * 0.1, h);
  }

  // Techo: el alero vuela más ancho que las columnas, que es lo que lo hace kiosco.
  ctx.save();
  ctx.fillStyle = roof;
  ctx.strokeStyle = roof;
  ctx.lineWidth = w * 0.13;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Más bajo y más ancho que el techo del aserradero: a lo lejos no se confunden.
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.68, baseY - h);
  ctx.lineTo(cx, baseY - h - w * 0.3);
  ctx.lineTo(cx + w * 0.68, baseY - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, baseY - h - w * 0.4, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
      [0.23, 0.52],
      [0.79, 0.5],
      [0.5, 0.5],
    ];
    for (let i = 0; i < Math.min(level, 3); i++) {
      ctx.beginPath();
      ctx.arc(px + t * faroles[i][0], py + t * faroles[i][1], Math.max(1.6, t * 0.032), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  for (const { x, y, s } of windowsOf(level, facadeOf(type, level, px, py, t))) {
    roundRect(ctx, x, y, s, s, s * 0.2);
    ctx.fill();
  }
  ctx.restore();
}

// Lote descuidado: pasto crecido en la base (docs/07, "El canvas").
function drawGrass(ctx: CanvasRenderingContext2D, px: number, py: number, t: number) {
  const base = py + t * 0.89;
  ctx.save();
  ctx.strokeStyle = '#6f7d3a';
  ctx.lineWidth = Math.max(1.2, t * 0.026);
  ctx.lineCap = 'round';
  [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].forEach((d, i) => {
    const x = px + t / 2 + d * t;
    const h = t * (i % 2 ? 0.1 : 0.15);
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

// --- Obra pública ------------------------------------------------------
// Ocupa más que un lote, con doble borde, un edificio con frontón y la barra de progreso.
function drawWork(ctx: CanvasRenderingContext2D, work: PublicWork, px: number, py: number, t: number) {
  const out = t * 0.05;
  const x = px - out;
  const y = py - out;
  const s = t + out * 2;
  const done = work.status === 'completada';
  const stone = done ? '#f1e6c0' : '#e7e0ce';
  const trim = done ? '#b4922c' : '#8d8676';

  ctx.save();
  softShadow(ctx, t * 0.18, t * 0.05, 0.24);
  ctx.fillStyle = stone;
  roundRect(ctx, x, y, s, s, t * 0.16);
  ctx.fill();
  clearShadow(ctx);
  ctx.strokeStyle = trim;
  ctx.lineWidth = Math.max(1, t * 0.03);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  roundRect(ctx, x + t * 0.07, y + t * 0.07, s - t * 0.14, s - t * 0.14, t * 0.11);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Edificio cívico: escalinata, columnas y frontón. Arranca debajo del nombre.
  const bw = s * 0.56;
  const bx = x + (s - bw) / 2;
  const floor = y + s * 0.72;
  ctx.fillStyle = 'rgba(38, 32, 24, 0.13)';
  roundRect(ctx, bx - s * 0.08, floor, bw + s * 0.16, s * 0.05, s * 0.02);
  ctx.fill();

  ctx.fillStyle = '#fbf6e9';
  ctx.fillRect(bx, y + s * 0.46, bw, s * 0.26);
  ctx.fillStyle = trim;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(bx + s * 0.04 + (i * (bw - s * 0.125)) / 3, y + s * 0.48, s * 0.045, s * 0.22);
  }

  ctx.save();
  ctx.fillStyle = '#fbf6e9';
  ctx.strokeStyle = '#fbf6e9';
  ctx.lineWidth = s * 0.05;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - s * 0.05, y + s * 0.46);
  ctx.lineTo(x + s / 2, y + s * 0.33);
  ctx.lineTo(bx + bw + s * 0.05, y + s * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Barra de progreso.
  const pw = s - t * 0.3;
  const ph = Math.max(3, t * 0.085);
  const bar = x + t * 0.15;
  const barY = y + s - t * 0.21;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  roundRect(ctx, bar, barY, pw, ph, ph / 2);
  ctx.fill();
  ctx.fillStyle = done ? '#c9a227' : ACCENT;
  roundRect(ctx, bar, barY, Math.max(ph, (pw * workPercent(work)) / 100), ph, ph / 2);
  ctx.fill();
  ctx.restore();
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
