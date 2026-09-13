// Día y noche según la hora de la ciudad (docs/05-reglas-y-parametros.md §12). Puramente visual.
export type Phase = 'dia' | 'atardecer' | 'noche';

export function hourIn(date: Date, timeZone: string): number {
  // En desarrollo, ?hora=22 fuerza la hora para ver el mapa de noche.
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(window.location.search).get('hora');
    if (forced !== null) return Number(forced);
  }
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date);
  return Number(h);
}

export function phaseAt(date: Date, timeZone: string): Phase {
  const h = hourIn(date, timeZone);
  if (h >= 20 || h < 6) return 'noche';
  if (h >= 18 || h < 7) return 'atardecer';
  return 'dia';
}
