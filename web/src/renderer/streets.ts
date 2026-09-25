// La grilla de calles: toda celda que no es lote ni obra es calle. La comparten el
// dibujo de las calles y el tránsito, para que autos y gente vayan por donde se ve la calle.
// Las medidas van en tiles.
import type { Cell } from '../game/geo';

// Ancho de la vereda: la calzada va de cordón a cordón.
export const CURB = 0.17;

// Senda peatonal: `count` bastones de `bar` de ancho, repetidos cada `step` hacia
// adentro de la celda, el primero a `edge` del borde que da al cruce.
export const ZEBRA = { count: 4, bar: 0.04, step: 0.055, edge: 0.03 };
// Hondo de la senda y dónde cae su medio, medido desde el borde que da al cruce.
export const ZEBRA_DEPTH = (ZEBRA.count - 1) * ZEBRA.step + ZEBRA.bar;
export const ZEBRA_MID = ZEBRA.edge + ZEBRA_DEPTH / 2;

export type Streets = {
  cols: number;
  rows: number;
  inside: (x: number, y: number) => boolean;
  isStreet: (x: number, y: number) => boolean;
  isCrossing: (x: number, y: number) => boolean;
};

export function streetsOf(cols: number, rows: number, built: Cell[]): Streets {
  const taken = new Set(built.map((c) => `${c.x},${c.y}`));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  // Fuera de la grilla la calle sigue: así las avenidas salen del tablero en vez de cortarse.
  const isStreet = (x: number, y: number) => !inside(x, y) || !taken.has(`${x},${y}`);
  // Cruce: calle que sigue por al menos tres de sus lados.
  const isCrossing = (x: number, y: number) =>
    isStreet(x, y) &&
    [isStreet(x, y - 1), isStreet(x, y + 1), isStreet(x - 1, y), isStreet(x + 1, y)].filter(Boolean).length >= 3;
  return { cols, rows, inside, isStreet, isCrossing };
}
