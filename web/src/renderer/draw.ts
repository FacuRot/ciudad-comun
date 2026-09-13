// Dibuja la ciudad entera en cada cuadro. Sin optimizaciones: son ~100 celdas.
import type { MapBarrio as Barrio, MapLot as Lot, MapWork as PublicWork } from '../types/game';
import { workPercent, type Cell } from '../game/geo';
import { BUILDING_GLYPH, formatRemaining } from '../game/format';
import type { Layout } from './layout';
import { ABANDONED, desaturate, lotColor, mix } from './colors';
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
  marks?: Map<string, LotMark>; // pantalla de entrada: qué lotes libres se pueden tomar
  hovered?: Cell | null;
};

const THEME: Record<Phase, { ground: string; street: string; ink: string; overlay: string | null }> = {
  dia: { ground: '#efe9da', street: '#d3ccbc', ink: '#3b3a36', overlay: null },
  atardecer: { ground: '#eadbc6', street: '#cdbba6', ink: '#3b3a36', overlay: 'rgba(255, 140, 60, 0.10)' },
  noche: { ground: '#efe9da', street: '#d3ccbc', ink: '#f1ecdf', overlay: 'rgba(16, 24, 48, 0.58)' },
};

const ACCENT = '#2b8a80';
const WORKING = '#e8910c';
// Lado del edificio respecto del tile, por nivel (0 = sin edificio).
const BUILDING_SIZE = [0, 0.42, 0.58, 0.74];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawScene(ctx: CanvasRenderingContext2D, layout: Layout, scene: Scene, now: number) {
  const theme = THEME[phaseAt(new Date(now), scene.timezone)];
  const night = theme.overlay !== null && theme.ink !== THEME.dia.ink;
  const { tile: t, ox, oy, cols, rows } = layout;
  const at = (c: Cell) => ({ px: ox + c.x * t, py: oy + c.y * t });

  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Calles: toda celda que no es lote ni obra.
  const built = new Set([...scene.lots, ...scene.works].map((c) => `${c.x},${c.y}`));
  ctx.fillStyle = theme.street;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!built.has(`${x},${y}`)) ctx.fillRect(ox + x * t, oy + y * t, t, t);
    }
  }

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

  // De noche, ventanas encendidas donde hay gente.
  if (night) {
    for (const lot of scene.lots) {
      if (lot.status === 'ocupado' && lot.state === 'activo' && lot.level > 0) {
        const { px, py } = at(lot);
        drawWindows(ctx, lot.level, px, py, t);
      }
    }
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
    ctx.fillStyle = theme.ink;
    ctx.font = `600 ${Math.round(t * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(work.name, px + t / 2, py + t * 0.4);
  }
  drawClosedBarrios(ctx, scene, layout, theme.ink);

  for (const id of [scene.myLotId, scene.selectedLotId]) {
    const lot = id ? scene.lots.find((l) => l.id === id) : null;
    if (!lot) continue;
    const { px, py } = at(lot);
    ctx.strokeStyle = id === scene.selectedLotId ? ACCENT : theme.ink;
    ctx.lineWidth = Math.max(2, t * 0.05);
    roundRect(ctx, px + t * 0.035, py + t * 0.035, t * 0.93, t * 0.93, t * 0.1);
    ctx.stroke();
  }

  if (scene.hovered) {
    const { px, py } = at(scene.hovered);
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 0.75, py + 0.75, t - 1.5, t - 1.5);

    // Reloj con lo que falta sobre la construcción que está bajo el cursor (o el dedo).
    const lot = scene.lots.find((l) => l.x === scene.hovered!.x && l.y === scene.hovered!.y);
    const endsAt = lot ? building.get(lot.id) : undefined;
    if (endsAt !== undefined) drawClock(ctx, px, py, t, endsAt - now);
  }
}

// Dos trazos que dan una vuelta al lote cada 4 segundos.
function drawWorking(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, now: number) {
  const pad = t * 0.07;
  const s = t - pad * 2;
  const r = t * 0.08;
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

  ctx.fillStyle = 'rgba(30, 30, 28, 0.92)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

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
  const pad = t * 0.07;
  const s = t - pad * 2;
  const r = t * 0.08;

  if (lot.status === 'cerrado') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
    roundRect(ctx, px + pad, py + pad, s, s, r);
    ctx.fill();
    return;
  }

  if (lot.status === 'libre') {
    const mark = scene.marks?.get(lot.id);
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

  ctx.fillStyle = mix(color, '#ffffff', 0.6);
  roundRect(ctx, px + pad, py + pad, s, s, r);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, t * 0.03);
  ctx.stroke();

  if (lot.level > 0 && lot.building_type) {
    const bs = t * BUILDING_SIZE[lot.level];
    const bx = px + (t - bs) / 2;
    const by = py + (t - bs) / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    roundRect(ctx, bx, by + t * 0.05, bs, bs, t * 0.05);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, bx, by, bs, bs, t * 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `${Math.round(t * 0.26)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BUILDING_GLYPH[lot.building_type], px + t / 2, py + t / 2 + 1);
  }
}

function drawWindows(ctx: CanvasRenderingContext2D, level: number, px: number, py: number, t: number) {
  const bs = t * BUILDING_SIZE[level];
  const bx = px + (t - bs) / 2;
  const by = py + (t - bs) / 2;
  const w = Math.max(2, t * 0.07);
  ctx.save();
  ctx.fillStyle = '#ffd866';
  ctx.shadowColor = 'rgba(255, 210, 90, 0.9)';
  ctx.shadowBlur = t * 0.15;
  for (let i = 0; i < level; i++) {
    ctx.fillRect(bx + (bs * (i + 1)) / (level + 1) - w / 2, by + bs * 0.2, w, w);
  }
  ctx.restore();
}

function drawWork(ctx: CanvasRenderingContext2D, work: PublicWork, px: number, py: number, t: number) {
  const out = t * 0.04;
  const x = px - out;
  const y = py - out;
  const s = t + out * 2;
  const done = work.status === 'completada';

  ctx.fillStyle = done ? '#eadba8' : '#dcd5c5';
  roundRect(ctx, x, y, s, s, t * 0.06);
  ctx.fill();
  ctx.strokeStyle = '#6d675b';
  ctx.lineWidth = Math.max(1, t * 0.025);
  ctx.stroke();
  roundRect(ctx, x + t * 0.07, y + t * 0.07, s - t * 0.14, s - t * 0.14, t * 0.04);
  ctx.stroke();

  const bw = s - t * 0.3;
  const bh = Math.max(3, t * 0.09);
  const bx = x + t * 0.15;
  const by = y + s - t * 0.27;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = done ? '#c9a227' : ACCENT;
  ctx.fillRect(bx, by, (bw * workPercent(work)) / 100, bh);
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
