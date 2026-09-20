import type { Cell } from '../game/geo';

export type Layout = { cols: number; rows: number; tile: number; ox: number; oy: number };

// Cuánto se acerca el mapa y hacia dónde está corrido, en píxeles desde el centro.
// zoom 1 es la ciudad entera a la vista: nunca se puede alejar más que eso.
export type View = { zoom: number; panX: number; panY: number };

export const WHOLE_CITY: View = { zoom: 1, panX: 0, panY: 0 };
export const MAX_ZOOM = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Tile cuadrado del mayor tamaño que entra. Entero, para que el dibujo quede nítido.
function fitTile(width: number, height: number, cols: number, rows: number): number {
  return Math.max(1, Math.floor(Math.min(width / cols, height / rows)));
}

// Deja el zoom entre 1 y MAX_ZOOM y el desplazamiento dentro de lo que hay para ver:
// si la ciudad entra en el canvas queda centrada, y si no, no se puede correr más allá del borde.
export function clampView(view: View, width: number, height: number, cols: number, rows: number): View {
  const zoom = clamp(view.zoom, 1, MAX_ZOOM);
  const tile = fitTile(width, height, cols, rows) * zoom;
  const maxX = Math.max(0, (tile * cols - width) / 2);
  const maxY = Math.max(0, (tile * rows - height) / 2);
  return { zoom, panX: clamp(view.panX, -maxX, maxX), panY: clamp(view.panY, -maxY, maxY) };
}

export function computeLayout(
  width: number,
  height: number,
  cols: number,
  rows: number,
  view: View = WHOLE_CITY,
): Layout {
  const v = clampView(view, width, height, cols, rows);
  const tile = fitTile(width, height, cols, rows) * v.zoom;
  return {
    cols,
    rows,
    tile,
    ox: Math.round((width - tile * cols) / 2 + v.panX),
    oy: Math.round((height - tile * rows) / 2 + v.panY),
  };
}

// Acerca o aleja dejando quieto el punto (px, py) del canvas: es lo que hace el pellizco.
export function zoomAt(
  view: View,
  width: number,
  height: number,
  cols: number,
  rows: number,
  factor: number,
  px: number,
  py: number,
): View {
  const before = computeLayout(width, height, cols, rows, view);
  const zoomed = clampView({ ...view, zoom: view.zoom * factor }, width, height, cols, rows);
  const after = computeLayout(width, height, cols, rows, zoomed);
  // Dónde caía el dedo en la grilla, y cuánto hay que correr para que siga cayendo ahí.
  const cx = (px - before.ox) / before.tile;
  const cy = (py - before.oy) / before.tile;
  return clampView(
    {
      zoom: zoomed.zoom,
      panX: zoomed.panX + (px - (after.ox + cx * after.tile)),
      panY: zoomed.panY + (py - (after.oy + cy * after.tile)),
    },
    width,
    height,
    cols,
    rows,
  );
}

export function cellAt(layout: Layout, px: number, py: number): Cell | null {
  const x = Math.floor((px - layout.ox) / layout.tile);
  const y = Math.floor((py - layout.oy) / layout.tile);
  if (x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) return null;
  return { x, y };
}
