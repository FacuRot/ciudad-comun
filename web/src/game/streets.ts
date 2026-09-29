// Calles vistas desde el cliente (docs/05-reglas-y-parametros.md §18), con la misma cuenta
// que fx_streets_state. Solo sirve para mostrar: el estado lo guarda maintain_streets y el
// desgaste de ahí en adelante se calcula al leer, igual que en el servidor.
import type { Barrio, CityConfig, StreetsLevel, StreetsRanges } from '../types/game';

export type { StreetsLevel };

// El estado de ahora: el guardado menos el desgaste desde entonces, sin bajar de 0.
// Con el reloj en NULL (barrio cerrado) no se gasta.
export function streetsState(
  barrio: Pick<Barrio, 'streets_state' | 'streets_updated_at'>,
  cfg: CityConfig,
  now = Date.now(),
): number {
  if (!barrio.streets_updated_at) return barrio.streets_state;
  const days = (now - Date.parse(barrio.streets_updated_at)) / 86_400_000;
  return Math.max(0, barrio.streets_state - cfg.streets.decay_per_day * days);
}

// Se muestra redondeado a entero, y con eso se decide si ya están en 100.
export function shownStreets(state: number): number {
  return Math.round(state);
}

// Los rangos de la tabla de §18 (streets.worn_below y broken_below), sobre lo que se muestra.
export function streetsLevel(state: number, ranges: StreetsRanges): StreetsLevel {
  const shown = shownStreets(state);
  return shown < ranges.broken_below ? 'rotas' : shown < ranges.worn_below ? 'gastadas' : 'buenas';
}

// Día del juego (AAAA-MM-DD) de un instante: el tope de mantenimiento se renueva a las
// 00:00 hora de la ciudad, con las jornadas.
export function gameDay(at: string | number | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(at),
  );
}
