import type { Cell } from '../game/geo';

export type Layout = { cols: number; rows: number; tile: number; ox: number; oy: number };

// Tile cuadrado del mayor tamaño que entra, centrado en el canvas.
export function computeLayout(width: number, height: number, cols: number, rows: number): Layout {
  const tile = Math.max(1, Math.floor(Math.min(width / cols, height / rows)));
  return {
    cols,
    rows,
    tile,
    ox: Math.floor((width - tile * cols) / 2),
    oy: Math.floor((height - tile * rows) / 2),
  };
}

export function cellAt(layout: Layout, px: number, py: number): Cell | null {
  const x = Math.floor((px - layout.ox) / layout.tile);
  const y = Math.floor((py - layout.oy) / layout.tile);
  if (x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) return null;
  return { x, y };
}
