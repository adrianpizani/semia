"use client"

import { ArrowDown, ArrowUp, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Metrica } from "@/lib/types"
import { formatCompact } from "@/lib/range-utils"
import { formatRank } from "@/lib/ranking"
import { AnalisisRow, AnalisisSortDir, AnalisisSortKey } from "@/lib/analisis-rows"
import { getPartyIntensityRowTint, getPartyRowTint } from "@/lib/party-color"

interface AnalisisTableProps {
  rows: AnalisisRow[]
  numericSecondaries: Metrica[]
  selectedParty: string | null
  sortKey: AnalisisSortKey
  sortDir: AnalisisSortDir
  onSortChange: (key: AnalisisSortKey) => void
  search: string
  onSearchChange: (value: string) => void
  selectedGeografiaId: number | null
  onRowClick: (geografiaId: number, nombre: string) => void
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSortChange,
  className = "",
}: {
  label: string
  column: AnalisisSortKey
  sortKey: AnalisisSortKey
  sortDir: AnalisisSortDir
  onSortChange: (key: AnalisisSortKey) => void
  className?: string
}) {
  const active = sortKey === column
  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className={`inline-flex items-center gap-1 text-left font-medium hover:text-foreground ${className}`}
    >
      <span className="truncate">{label}</span>
      {active && (sortDir === "desc" ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />)}
    </button>
  )
}

export function AnalisisTable({
  rows,
  numericSecondaries,
  selectedParty,
  sortKey,
  sortDir,
  onSortChange,
  search,
  onSearchChange,
  selectedGeografiaId,
  onRowClick,
}: AnalisisTableProps) {
  const shareLabel = selectedParty ? `% partido` : "Ganador"

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar municipio..."
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{rows.length} partidos</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">
                <SortHeader label="Municipio" column="nombre" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <SortHeader
                  label={shareLabel}
                  column="share"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSortChange={onSortChange}
                />
              </th>
              {numericSecondaries.map(metric => (
                <th key={metric.id} className="px-3 py-2 text-right font-medium">
                  <SortHeader
                    label={metric.nombre_amigable}
                    column={`m:${metric.id}`}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={onSortChange}
                    className="w-full justify-end"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2 + numericSecondaries.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No hay filas para este recorte. Elegí una métrica primaria electoral.
                </td>
              </tr>
            ) : rows.map(row => {
              const selected = row.geografia_id === selectedGeografiaId
              const rowTint = !selectedParty && row.ganador
                ? getPartyRowTint(row.ganador, selected ? 0.2 : 0.12)
                : selectedParty
                  ? getPartyIntensityRowTint(selectedParty, row.share, selected ? 0.06 : 0)
                  : undefined
              return (
                <tr
                  key={row.geografia_id}
                  onClick={() => onRowClick(row.geografia_id, row.nombre)}
                  style={rowTint ? { backgroundColor: rowTint } : undefined}
                  className={`cursor-pointer border-b border-border/60 ${selected ? "ring-1 ring-inset ring-foreground/15" : ""} ${!rowTint ? "hover:bg-muted/50" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">{row.nombre}</td>
                  <td className="px-3 py-2">
                    {selectedParty ? (
                      <span className="font-mono tabular-nums">{row.share != null ? `${row.share.toFixed(1)}%` : "—"}</span>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-xs" title={row.ganador ?? undefined}>{row.ganador ?? "—"}</p>
                        <p className="font-mono text-xs tabular-nums text-muted-foreground">
                          {row.share != null ? `${row.share.toFixed(1)}%` : ""}
                        </p>
                      </div>
                    )}
                  </td>
                  {numericSecondaries.map(metric => {
                    const cell = row.secondaries[metric.id]
                    return (
                      <td key={metric.id} className="px-3 py-2 text-right">
                        <p className="font-mono tabular-nums">{cell?.valor != null ? formatCompact(cell.valor) : "—"}</p>
                        {cell?.rank != null && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">{formatRank(cell.rank, cell.n)}</p>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
