// Correlación de Pearson sobre pares (x, y).
// Devuelve null si hay menos de 10 puntos o si no hay varianza (evita r engañoso).
const PEARSON_MIN_N = 10;

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < PEARSON_MIN_N || n !== ys.length) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return num / den;
}

export const PEARSON_MIN_POINTS = PEARSON_MIN_N;

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Frase legible para el cliente (sin jerga de |r|). */
export function describePearson(r: number): string {
  const abs = Math.abs(r);
  const sense = r >= 0 ? "directa" : "inversa";
  if (abs < 0.2) return "sin relación clara entre las dos variables";
  if (abs < 0.4) return `relación ${sense} leve`;
  if (abs < 0.7) return `relación ${sense} moderada`;
  return `relación ${sense} fuerte`;
}

export type CruceOutlier = {
  geografia_id: number;
  nombre: string;
  x: number;
  y: number;
  /** Residual vs. la recta de tendencia (y observada − y esperada). */
  residual: number;
};

type XYPoint = { geografia_id: number; nombre: string; x: number; y: number };

function linearFit(points: XYPoint[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    num += dx * (p.y - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX };
}

/** Municipios más alejados de la tendencia lineal del cruce. */
export function findOutliers(points: XYPoint[], count = 3): CruceOutlier[] {
  const fit = linearFit(points);
  if (!fit) return [];
  const scored = points.map(p => {
    const expected = fit.slope * p.x + fit.intercept;
    return {
      geografia_id: p.geografia_id,
      nombre: p.nombre,
      x: p.x,
      y: p.y,
      residual: p.y - expected,
    };
  });
  scored.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  return scored.slice(0, Math.min(count, scored.length));
}

export type QuartileBand = {
  label: string;
  n: number;
  medianY: number;
};

/** Contraste: 25% más bajo en X vs 25% más alto en X (mediana de Y). */
export function quartileContrast(points: XYPoint[]): { low: QuartileBand; high: QuartileBand } | null {
  if (points.length < 8) return null;
  const byX = [...points].sort((a, b) => a.x - b.x);
  const qSize = Math.max(2, Math.floor(byX.length / 4));
  const lowPts = byX.slice(0, qSize);
  const highPts = byX.slice(-qSize);
  const lowMed = median(lowPts.map(p => p.y));
  const highMed = median(highPts.map(p => p.y));
  if (lowMed == null || highMed == null) return null;
  return {
    low: { label: "25% más bajo en X", n: lowPts.length, medianY: lowMed },
    high: { label: "25% más alto en X", n: highPts.length, medianY: highMed },
  };
}
