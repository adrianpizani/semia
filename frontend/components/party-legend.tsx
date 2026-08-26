"use client"
import { getIntensityOpacity, getPartiesColorMap, getPartyColor, IntensityDomain } from '@/lib/party-color';

const INTENSITY_STOPS = [0, 0.25, 0.5, 0.75, 1];

function formatPct(share: number): string {
  return `${(share * 100).toFixed(0)}%`;
}

// Leyenda de partidos como overlay del mapa (abajo a la derecha).
// En modo ganador lista colores por partido; en modo intensidad muestra
// la escala relativa al rango observado del partido en el recorte actual.
export function PartyLegend({
  parties,
  highlightParty = null,
  intensityDomain = { min: 0, max: 1 },
}: {
  parties: string[];
  highlightParty?: string | null;
  intensityDomain?: IntensityDomain;
}) {
  if (highlightParty) {
    const color = getPartyColor(highlightParty);
    const mid = (intensityDomain.min + intensityDomain.max) / 2;
    return (
      <div className="absolute bottom-2 right-2 z-[1000] w-[240px] rounded-lg border border-border bg-card/95 p-3 shadow-md">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Intensidad relativa</p>
        <p className="mb-2 truncate text-xs font-medium" title={highlightParty}>{highlightParty}</p>
        <div className="mb-1 flex h-3 overflow-hidden rounded-sm border border-black/15">
          {INTENSITY_STOPS.map((t) => {
            const share = intensityDomain.min + t * (intensityDomain.max - intensityDomain.min);
            return (
              <div
                key={t}
                className="h-full flex-1"
                style={{ backgroundColor: color, opacity: getIntensityOpacity(share, intensityDomain) }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatPct(intensityDomain.min)}</span>
          <span>{formatPct(mid)}</span>
          <span>{formatPct(intensityDomain.max)}</span>
        </div>
      </div>
    );
  }

  if (!parties || parties.length === 0) return null;

  const colorMap = getPartiesColorMap(parties);

  return (
    <div className="absolute bottom-2 right-2 z-[1000] w-[240px] rounded-lg border border-border bg-card/95 p-3 shadow-md">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Partido ganador por distrito</p>
      <ul className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
        {parties.map((party) => (
          <li key={party} className="flex items-center gap-2 text-xs">
            <span
              className="h-3 w-3 shrink-0 rounded-sm border border-black/20"
              style={{ backgroundColor: colorMap[party] }}
            />
            <span className="truncate" title={party}>{party}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
