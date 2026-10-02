// Cómo se nombran y se muestran las cosas del juego. Los números vienen de la config; los textos, de i18n.
import type { BuildingType, Material } from '../types/game';
import type { FactorKey } from './citizens';
import { t } from '../i18n';

export const MATERIAL_LABEL: Record<Material, string> = t.materials;

export const BUILDING_LABEL: Record<BuildingType, string> = t.buildings;

// Singular y plural en minúscula, para contar ("3 generadores").
export const BUILDING_COUNT = t.buildingCount as Record<BuildingType, [string, string]>;

// Glifo del edificio en el mapa y en el panel (docs/07, "El canvas").
export const BUILDING_GLYPH: Record<BuildingType, string> = {
  ladrilleria: '■',
  aserradero: '▲',
  generador: '⚡︎',
  plaza: '✿',
  residencial: '⌂',
};

// Los factores del atractivo (docs/05 §16.2). La obra se nombra con el nombre de la del barrio.
export const FACTOR_LABEL: Record<FactorKey, string> = t.factors;

// "Lo que más resta: …". En español el artículo de la obra sale de su nombre: la Escuela, el Hospital.
export function reasonText(reason: FactorKey, workName?: string): string {
  return reason === 'obra' ? t.reason.obra(workName) : t.reason[reason];
}

// Nombre de un color de la paleta, para leerlo (aria-label, title).
export function colorLabel(color: string): string {
  return t.colors[color] ?? color;
}

const decimal = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 });

export function formatNumber(n: number): string {
  return decimal.format(n);
}

export function formatHours(hours: number): string {
  return `${decimal.format(hours)} h`;
}

export function formatPercent(fraction: number): string {
  return formatPoints(fraction * 100);
}

// Un porcentaje que ya viene de 0 a 100, como el avance de una obra.
export function formatPoints(points: number): string {
  return t.format.percent(decimal.format(points));
}

// "1 h 20 min", "45 min". Redondea hacia arriba para no prometer antes de tiempo.
export function formatRemaining(ms: number): string {
  if (ms <= 0) return t.format.finishing;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dayFormat = new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long' });

// "14 de septiembre", "September 14": desde cuándo anda alguien por la ciudad.
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

const whenFormat = new Intl.DateTimeFormat(t.locale, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

// "14 sept, 10:32": para el panel de administración, que sí mira la hora.
export function formatWhen(iso: string): string {
  return whenFormat.format(new Date(iso));
}
