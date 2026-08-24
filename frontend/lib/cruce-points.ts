import { ElectoralData, GenericData } from "@/lib/types"
import { getPartyVoteShare } from "@/lib/party-color"

export type CrucePoint = {
  geografia_id: number
  nombre: string
  x: number
  y: number
  partido: string | null
}

export function buildCrucePoints(
  electoralData: ElectoralData[],
  secondaryData: GenericData[],
  selectedParty: string | null,
): CrucePoint[] {
  const byGeo = new Map<number, number>()
  for (const row of secondaryData) {
    if (row.valor !== null && Number.isFinite(row.valor)) {
      byGeo.set(row.geografia_id, row.valor)
    }
  }

  const points: CrucePoint[] = []
  for (const district of electoralData) {
    const x = byGeo.get(district.geografia_id)
    if (x === undefined) continue
    const party = selectedParty ?? district.ganador?.partido ?? null
    if (!party) continue
    points.push({
      geografia_id: district.geografia_id,
      nombre: district.nombre,
      x,
      y: getPartyVoteShare(district.resultados, party) * 100,
      partido: selectedParty ?? district.ganador?.partido ?? null,
    })
  }
  return points
}
