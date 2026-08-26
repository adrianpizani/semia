// Utilidades de color por partido, compartidas entre el mapa y la leyenda.

// Paleta conocida para partidos principales (colores estables y legibles).
const KNOWN_PARTY_COLORS: Record<string, string> = {
  'JUNTOS POR EL CAMBIO': '#FFD700',
  'JUNTOS': '#FFD700',
  'FRENTE DE TODOS': '#1E90FF',
  'CONSENSO FEDERAL': '#FFA500',
  'FRENTE DE IZQUIERDA Y DE TRABAJADORES - UNIDAD': '#FF0000',
  'FRENTE DE IZQUIERDA Y DE LOS TRABAJADORES': '#DC143C',
  'FRENTE DE IZQUIERDA Y DE LOS TRABAJADORES - UNIDAD': '#DC143C',
  'UNIDAD CIUDADANA': '#87CEEB',
  'CAMBIEMOS BUENOS AIRES': '#FFC0CB',
  '1PAIS': '#9370DB',
  'FRENTE JUSTICIALISTA': '#00008B',
};

// Hash determinístico de un string -> entero no negativo.
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return Math.abs(h);
}

// Devuelve el color de un partido: si está en la paleta conocida usa ese color;
// si no, genera uno determinístico (mismo partido => mismo color), para que con
// datasets grandes (muchos partidos) el mapa y la leyenda no queden todos en gris.
export function getPartyColor(partyName: string | null | undefined): string {
  if (!partyName) return '#D1D5DB'; // gris por defecto (sin partido / datos)
  const known = KNOWN_PARTY_COLORS[partyName];
  if (known) return known;
  const hue = hashString(partyName) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

// Devuelve un mapa partido -> color para una lista de partidos.
export function getPartiesColorMap(parties: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const party of parties) {
    map[party] = getPartyColor(party);
  }
  return map;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Tinte suave del color del partido (p. ej. filas de tabla en modo ganador por distrito).
export function getPartyRowTint(
  partyName: string | null | undefined,
  alpha = 0.12,
): string | undefined {
  if (!partyName) return undefined;
  const color = getPartyColor(partyName);
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  if (color.startsWith("hsl(")) {
    return color.replace(/^hsl\(/, "hsla(").replace(/\)$/, `, ${alpha})`);
  }
  return color;
}

// Opacidad del mapa en modo "intensidad".
// Se estira al rango observado del partido (getShareDomain): en elecciones reales
// los % suelen concentrarse en una franja estrecha y un mapeo 0-100% deja el mapa plano.
const INTENSITY_OPACITY_MIN = 0.12;
const INTENSITY_OPACITY_MAX = 0.95;

const ROW_INTENSITY_ALPHA_MIN = 0.05;
const ROW_INTENSITY_ALPHA_MAX = 0.3;

export type IntensityDomain = { min: number; max: number };

export function getPartyVoteShare(
  resultados: { partido: string; votos: number }[] | undefined,
  party: string,
): number {
  if (!resultados || resultados.length === 0) return 0;
  const total = resultados.reduce((sum, row) => sum + row.votos, 0);
  if (total <= 0) return 0;
  const row = resultados.find(r => r.partido === party);
  return row ? row.votos / total : 0;
}

// Dominio visual a partir de los % del partido en el recorte actual (p5-p95).
export function getShareDomain(shares: number[]): IntensityDomain {
  const finite = shares.filter(s => Number.isFinite(s)).sort((a, b) => a - b);
  if (finite.length === 0) return { min: 0, max: 1 };

  const pick = (q: number) => {
    const i = (finite.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return finite[lo];
    return finite[lo] + (finite[hi] - finite[lo]) * (i - lo);
  };

  let min = finite.length >= 5 ? pick(0.05) : finite[0];
  let max = finite.length >= 5 ? pick(0.95) : finite[finite.length - 1];

  if (max - min < 0.03) {
    const mid = (min + max) / 2;
    min = Math.max(0, mid - 0.05);
    max = Math.min(1, mid + 0.05);
  }
  if (max <= min) return { min: 0, max: 1 };
  return { min, max };
}

export function getIntensityOpacity(
  share: number,
  domain: IntensityDomain = { min: 0, max: 1 },
): number {
  const span = domain.max - domain.min || 1;
  const t = Math.max(0, Math.min(1, (share - domain.min) / span));
  return INTENSITY_OPACITY_MIN + t * (INTENSITY_OPACITY_MAX - INTENSITY_OPACITY_MIN);
}

export function getPartyIntensityRowTint(
  partyName: string | null | undefined,
  sharePercent: number | null | undefined,
  boost = 0,
): string | undefined {
  if (!partyName || sharePercent == null) return undefined;
  const share = Math.max(0, Math.min(1, sharePercent / 100));
  // Filas: escala absoluta 0-100% (el numero ya comunica la magnitud).
  const mapOpacity = getIntensityOpacity(share, { min: 0, max: 1 });
  const t = (mapOpacity - INTENSITY_OPACITY_MIN) / (INTENSITY_OPACITY_MAX - INTENSITY_OPACITY_MIN);
  const alpha = Math.min(
    ROW_INTENSITY_ALPHA_MAX + boost,
    ROW_INTENSITY_ALPHA_MIN + t * (ROW_INTENSITY_ALPHA_MAX - ROW_INTENSITY_ALPHA_MIN) + boost,
  );
  return getPartyRowTint(partyName, alpha);
}
