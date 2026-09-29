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

type Parcel = Cell & { barrio_id: string };

// De qué barrio es cada celda de calle (docs/05 §18): del que tiene más lotes en las ocho
// celdas de alrededor; si empatan (la avenida del medio), del de menor número. Si no hay
// ningún lote pegado, se mira una vuelta más afuera. Fuera del tablero vale la celda de
// borde más cercana, así lo que entra y sale por el borde sigue siendo de su barrio.
export function streetBarrios(
  cols: number,
  rows: number,
  lots: Parcel[],
  barrios: { id: string; ordinal: number }[],
): (x: number, y: number) => string | null {
  const barrioAt = new Map(lots.map((l) => [`${l.x},${l.y}`, l.barrio_id]));
  const ordinal = new Map(barrios.map((b) => [b.id, b.ordinal]));
  const cache = new Map<string, string | null>();
  return (x, y) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(y)));
    const key = `${cx},${cy}`;
    if (cache.has(key)) return cache.get(key)!;
    let owner: string | null = null;
    for (let r = 1; r <= 2 && owner === null; r++) {
      const count = new Map<string, number>();
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const id = barrioAt.get(`${cx + dx},${cy + dy}`);
          if ((dx || dy) && id) count.set(id, (count.get(id) ?? 0) + 1);
        }
      }
      let best = 0;
      for (const [id, n] of count) {
        const tie = n === best && owner !== null && (ordinal.get(id) ?? 0) < (ordinal.get(owner) ?? 0);
        if (n > best || tie) {
          best = n;
          owner = id;
        }
      }
    }
    cache.set(key, owner);
    return owner;
  };
}

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
