// Utilidades para filtros de rango numérico (p. ej. métricas económicas como PBG).
// Data-driven: se adaptan a la dispersión de la muestra, así funcionan para cualquier
// métrica (hoy PBG, mañana otro indicador económico) sin hardcodear nada.

export type RangeScale = 'log' | 'linear';

// Umbral de dispersión (max/min) para decidir escala logarítmica.
// Con ratios tan grandes (p. ej. PBG ~165x) un slider lineal pierde proporción porque
// casi todos los municipios se apilan a la izquierda.
const LOG_RATIO_THRESHOLD = 100;

// Decide la escala de forma automática según la dispersión de los valores de la muestra.
// Si hay valores <= 0, la escala log no está definida, así que cae a 'linear'.
export function decideScale(values: number[]): RangeScale {
  const positive = values.filter(v => v != null && Number.isFinite(v) && v > 0);
  if (positive.length === 0) return 'linear';
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  if (min <= 0) return 'linear';
  return max / min >= LOG_RATIO_THRESHOLD ? 'log' : 'linear';
}

// Escala efectiva: preferencia de la métrica (gestión) o detección automática.
export function resolveRangeScale(
  configured: 'log' | 'linear' | null | undefined,
  detected: RangeScale,
  min: number,
): RangeScale {
  if (configured === 'linear') return 'linear';
  if (configured === 'log') return min > 0 ? 'log' : 'linear';
  return detected;
}

// Convierte un valor a su posición normalizada (0..1) dentro del rango, con escala.
export function toNormPosition(min: number, max: number, value: number, scale: RangeScale): number {
  if (scale === 'log' && min > 0) {
    return (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  }
  const span = max - min || 1;
  return (value - min) / span;
}

// Convierte una posición normalizada (0..1) al valor real, con escala.
export function fromNormPosition(min: number, max: number, position: number, scale: RangeScale): number {
  if (scale === 'log' && min > 0) {
    return Math.pow(10, Math.log10(min) + position * (Math.log10(max) - Math.log10(min)));
  }
  return min + (max - min) * position;
}

// Formato compacto estilo es-AR: 287.654.321 -> "287,7 M", 7.123.456.789 -> "7,1 B".
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const nf = (v: number, digits: number) =>
    v.toLocaleString('es-AR', { maximumFractionDigits: digits });
  if (abs >= 1e9) return `${nf(value / 1e9, 1)} B`;
  if (abs >= 1e6) return `${nf(value / 1e6, 1)} M`;
  if (abs >= 1e3) return `${nf(value / 1e3, 1)} K`;
  return nf(value, 0);
}