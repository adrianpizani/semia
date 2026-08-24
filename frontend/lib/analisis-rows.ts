import { ElectoralData, GenericData, Metrica } from "@/lib/types"
import { getPartyVoteShare } from "@/lib/party-color"
import { rankDescending } from "@/lib/ranking"

export type AnalisisSortKey = "nombre" | "share" | `m:${number}`
export type AnalisisSortDir = "asc" | "desc"

export type AnalisisRow = {
  geografia_id: number
  nombre: string
  ganador: string | null
  share: number | null
  secondaries: Record<number, { valor: number | null; rank: number | null; n: number }>
}

export function buildAnalisisRows(
  electoralData: ElectoralData[] | null,
  secondaryMetricsData: { [metricId: number]: GenericData[] },
  numericSecondaries: Metrica[],
  selectedParty: string | null,
): AnalisisRow[] {
  if (!electoralData) return []

  const ranksByMetric: Record<number, Map<number, { rank: number; n: number }>> = {}
  for (const metric of numericSecondaries) {
    const values = (secondaryMetricsData[metric.id] ?? [])
      .map(row => row.valor)
      .filter((v): v is number => v !== null && Number.isFinite(v))
    const byGeo = new Map<number, { rank: number; n: number }>()
    for (const row of secondaryMetricsData[metric.id] ?? []) {
      if (row.valor === null || !Number.isFinite(row.valor)) continue
      const ranked = rankDescending(values, row.valor)
      if (ranked) byGeo.set(row.geografia_id, ranked)
    }
    ranksByMetric[metric.id] = byGeo
  }

  return electoralData.map(district => {
    const party = selectedParty ?? district.ganador?.partido ?? null
    const share = party ? getPartyVoteShare(district.resultados, party) * 100 : null
    const secondaries: AnalisisRow["secondaries"] = {}
    for (const metric of numericSecondaries) {
      const row = (secondaryMetricsData[metric.id] ?? []).find(r => r.geografia_id === district.geografia_id)
      const ranked = ranksByMetric[metric.id]?.get(district.geografia_id)
      secondaries[metric.id] = {
        valor: row?.valor ?? null,
        rank: ranked?.rank ?? null,
        n: ranked?.n ?? 0,
      }
    }
    return {
      geografia_id: district.geografia_id,
      nombre: district.nombre,
      ganador: district.ganador?.partido ?? null,
      share,
      secondaries,
    }
  })
}

function cellValue(row: AnalisisRow, key: AnalisisSortKey): string | number | null {
  if (key === "nombre") return row.nombre
  if (key === "share") return row.share
  const metricId = Number(key.slice(2))
  return row.secondaries[metricId]?.valor ?? null
}

export function sortAnalisisRows(
  rows: AnalisisRow[],
  key: AnalisisSortKey,
  dir: AnalisisSortDir,
): AnalisisRow[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    const va = cellValue(a, key)
    const vb = cellValue(b, key)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === "string"
      ? va.localeCompare(vb, "es")
      : va - vb
    return dir === "asc" ? cmp : -cmp
  })
  return copy
}
