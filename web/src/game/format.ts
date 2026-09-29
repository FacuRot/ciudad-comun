// Cómo se nombran y se muestran las cosas del juego. Los números vienen de la config; acá solo el texto.
import type { BuildingType, Material } from '../types/game';
import type { FactorKey } from './citizens';

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

// Los factores del atractivo (docs/05 §16.2). La obra se nombra con el nombre de la del barrio.
export const FACTOR_LABEL: Record<FactorKey, string> = {
  lotes: 'Vecinos presentes',
  calles: 'Calles',
  abastecimiento: 'Abastecimiento',
  obra: 'Obra del barrio',
};

// "Lo que más resta: …". El artículo de la obra sale de su nombre: la Escuela, el Hospital.
export function reasonText(reason: FactorKey, workName?: string): string {
  switch (reason) {
    case 'lotes':
      return 'los lotes descuidados';
    case 'calles':
      return 'las calles';
    case 'abastecimiento':
      return 'la falta de producción';
    case 'obra':
      return workName ? `que falta terminar ${workName.endsWith('a') ? 'la' : 'el'} ${workName}` : 'que falta terminar la obra';
  }
}

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

const whenFormat = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

// "14 sept, 10:32": para el panel de administración, que sí mira la hora.
export function formatWhen(iso: string): string {
  return whenFormat.format(new Date(iso));
}
