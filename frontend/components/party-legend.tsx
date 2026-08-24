"use client"
import { getIntensityOpacity, getPartiesColorMap, getPartyColor } from '@/lib/party-color';

const INTENSITY_STOPS = [0, 0.25, 0.5, 0.75, 1];

// Leyenda de partidos como overlay del mapa (abajo a la derecha).
// En modo ganador lista colores por partido; en modo intensidad muestra
// la escala de % de votos del partido elegido.
export function PartyLegend({
  parties,
  highlightParty = null,
}: {
  parties: string[];
  highlightParty?: string | null;
}) {
  if (highlightParty) {
    const color = getPartyColor(highlightParty);
    return (
      <div className="absolute bottom-2 right-2 z-[1000] w-[240px] rounded-lg border border-border bg-card/95 p-3 shadow-md">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Intensidad de voto</p>
        <p className="mb-2 truncate text-xs font-medium" title={highlightParty}>{highlightParty}</p>
        <div className="mb-1 flex h-3 overflow-hidden rounded-sm border border-black/15">
          {INTENSITY_STOPS.map((share) => (
            <div
              key={share}
              className="h-full flex-1"
              style={{ backgroundColor: color, opacity: getIntensityOpacity(share) }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
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
