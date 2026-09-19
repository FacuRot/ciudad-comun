// Cómo se nombran y se muestran las cosas del juego. Los números vienen de la config; acá solo el texto.
import type { BuildingType, Material } from '../types/game';

export const MATERIAL_LABEL: Record<Material, string> = { ladrillo: 'ladrillo', madera: 'madera', energia: 'energía' };

export const BUILDING_LABEL: Record<BuildingType, string> = {
  ladrilleria: 'Ladrillería',
  aserradero: 'Aserradero',
  generador: 'Generador',
  plaza: 'Plaza',
};

// Singular y plural en minúscula, para contar ("3 generadores").
export const BUILDING_COUNT: Record<BuildingType, [string, string]> = {
  ladrilleria: ['ladrillería', 'ladrillerías'],
  aserradero: ['aserradero', 'aserraderos'],
  generador: ['generador', 'generadores'],
  plaza: ['plaza', 'plazas'],
};

// Glifo del edificio en el mapa y en el panel (docs/07, "El canvas").
export const BUILDING_GLYPH: Record<BuildingType, string> = {
  ladrilleria: '■',
  aserradero: '▲',
  generador: '⚡︎',
  plaza: '✿',
};

const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
  return decimal.format(n);
}

export function formatHours(hours: number): string {
  return `${decimal.format(hours)} h`;
}

export function formatPercent(fraction: number): string {
  return `${decimal.format(fraction * 100)} %`;
}

// "1 h 20 min", "45 min". Redondea hacia arriba para no prometer antes de tiempo.
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'terminando…';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dayFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });

// "14 de septiembre": desde cuándo anda alguien por la ciudad.
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
