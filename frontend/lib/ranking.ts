// Ranking por magnitud: puesto 1 = valor más alto. Sin juicio de "mejor/peor".
export function rankDescending(values: number[], value: number): { rank: number; n: number } | null {
  const finite = values.filter(v => Number.isFinite(v));
  if (!Number.isFinite(value) || finite.length === 0) return null;
  const rank = finite.filter(v => v > value).length + 1;
  return { rank, n: finite.length };
}

export function formatRank(rank: number, n: number): string {
  return `${rank} / ${n}`;
}
