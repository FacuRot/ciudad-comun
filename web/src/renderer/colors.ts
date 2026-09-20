// Paleta visual. Los nombres vienen de cities.config.palette; acá solo se decide cómo se ven.
export const LOT_COLORS: Record<string, string> = {
  terracota: '#c4623f',
  ocre: '#d09a2e',
  oliva: '#7b8b3c',
  teal: '#2b8a80',
  azul: '#3d6fb3',
  lila: '#8e76bf',
  rosa: '#d0749a',
  gris: '#86898c',
};

export const ABANDONED = '#9a9a96';

export function lotColor(name: string | null): string {
  return (name && LOT_COLORS[name]) || LOT_COLORS.gris;
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Mezcla dos colores: t = 0 devuelve a, t = 1 devuelve b.
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  return toHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t) as [number, number, number]);
}

// Lleva el color hacia su gris equivalente.
export function desaturate(hex: string, amount: number): string {
  const [r, g, b] = parse(hex);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return mix(hex, toHex([l, l, l]), amount);
}

// Oscurece hacia el marrón de la tinta, no al negro puro: los bordes quedan cálidos.
export function darken(hex: string, amount: number): string {
  return mix(hex, '#2a241c', amount);
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}
