"use client"
import { getPartiesColorMap } from '@/lib/party-color';

// Leyenda de partidos como overlay del mapa (abajo a la derecha).
// Se construye a partir de los partidos presentes en los datos electorales actuales,
// así refleja la selección/filtros vigentes.
export function PartyLegend({ parties }: { parties: string[] }) {
  if (!parties || parties.length === 0) return null;

  const colorMap = getPartiesColorMap(parties);

  return (
    <div className="absolute bottom-2 right-2 z-[1000] w-[240px] rounded-lg border border-border bg-card/95 p-3 shadow-md">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Partido por distrito</p>
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