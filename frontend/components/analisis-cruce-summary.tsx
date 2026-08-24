"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ElectoralData, GenericData } from "@/lib/types"
import { buildCrucePoints } from "@/lib/cruce-points"
import {
  PEARSON_MIN_POINTS,
  describePearson,
  findOutliers,
  median,
  pearsonCorrelation,
  quartileContrast,
} from "@/lib/correlation"
import { formatCompact } from "@/lib/range-utils"

interface AnalisisCruceSummaryProps {
  electoralData: ElectoralData[]
  secondaryData: GenericData[]
  selectedParty: string | null
  xLabel: string
  yLabel: string
  selectedGeografiaId?: number | null
  onPointClick: (geografiaId: number, nombre: string) => void
  rangeFilterActive?: boolean
}

function fmtPct(value: number): string {
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`
}

export function AnalisisCruceSummary({
  electoralData,
  secondaryData,
  selectedParty,
  xLabel,
  yLabel,
  selectedGeografiaId = null,
  onPointClick,
  rangeFilterActive = false,
}: AnalisisCruceSummaryProps) {
  const points = useMemo(
    () => buildCrucePoints(electoralData, secondaryData, selectedParty),
    [electoralData, secondaryData, selectedParty],
  )

  const summary = useMemo(() => {
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    return {
      n: points.length,
      pearson: pearsonCorrelation(xs, ys),
      medianX: median(xs),
      medianY: median(ys),
      outliers: findOutliers(points, 3),
      bands: quartileContrast(points),
    }
  }, [points])

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Lectura del cruce
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay municipios con ambas variables en este recorte.</p>
        </CardContent>
      </Card>
    )
  }

  const rText = summary.pearson != null
    ? `r = ${summary.pearson.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${describePearson(summary.pearson)}`
    : summary.n < PEARSON_MIN_POINTS
      ? `Hacen falta al menos ${PEARSON_MIN_POINTS} municipios para estimar la correlación (${summary.n} ahora).`
      : "No se puede estimar la correlación con esta muestra."

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Lectura del cruce
        </CardTitle>
        <CardDescription className="text-sm">
          {xLabel} × {yLabel}
          {rangeFilterActive ? " · sobre el recorte filtrado" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Municipios</p>
            <p className="font-mono text-sm font-semibold tabular-nums">{summary.n}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mediana {xLabel}</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {summary.medianX != null ? formatCompact(summary.medianX) : "—"}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mediana {yLabel}</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {summary.medianY != null ? fmtPct(summary.medianY) : "—"}
            </p>
          </div>
        </div>

        <p className="text-sm leading-snug">{rText}</p>

        {summary.bands && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contraste por franjas</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border px-2 py-2">
                <p className="text-muted-foreground">25% más bajo en {xLabel}</p>
                <p className="mt-1 font-mono tabular-nums">
                  {fmtPct(summary.bands.low.medianY)} <span className="text-muted-foreground">mediana {yLabel}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{summary.bands.low.n} partidos</p>
              </div>
              <div className="rounded-md border border-border px-2 py-2">
                <p className="text-muted-foreground">25% más alto en {xLabel}</p>
                <p className="mt-1 font-mono tabular-nums">
                  {fmtPct(summary.bands.high.medianY)} <span className="text-muted-foreground">mediana {yLabel}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{summary.bands.high.n} partidos</p>
              </div>
            </div>
          </div>
        )}

        {summary.outliers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Destacados (lejos de la tendencia)
            </p>
            <ul className="space-y-1">
              {summary.outliers.map(o => {
                const selected = o.geografia_id === selectedGeografiaId
                const above = o.residual > 0
                return (
                  <li key={o.geografia_id}>
                    <button
                      type="button"
                      onClick={() => onPointClick(o.geografia_id, o.nombre)}
                      className={`flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 ${selected ? "bg-cyan-50" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.nombre}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {above ? "Por encima" : "Por debajo"} de lo esperado · {yLabel} {fmtPct(o.y)}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatCompact(o.x)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
