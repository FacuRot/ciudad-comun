// Idioma de la interfaz: inglés o español según el navegador, inglés si no pide ninguno de los dos.
// Se decide una vez al cargar; no hay selector, así que no hace falta contexto de React:
// cualquier módulo importa `t` y lee el texto.
import { en, type Messages } from './en';
import { es } from './es';

export type Lang = 'en' | 'es';

// Recorre las preferencias en orden y se queda con la primera que soportamos ("es-AR" → es).
export function detectLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'es' || base === 'en') return base;
  }
  return 'en';
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export const lang: Lang = detectLang(browserLanguages());

export const t: Messages = lang === 'es' ? es : en;

if (typeof document !== 'undefined') document.documentElement.lang = lang;
