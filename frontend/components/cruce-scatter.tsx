"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ElectoralData, GenericData, Metrica } from "@/lib/types"
import { getPartyColor } from "@/lib/party-color"
import { formatCompact } from "@/lib/range-utils"
import { PEARSON_MIN_POINTS, pearsonCorrelation } from "@/lib/correlation"
import { buildCrucePoints, CrucePoint } from "@/lib/cruce-points"

interface CruceScatterProps {
  electoralData: ElectoralData[];
  secondaryData: GenericData[];
  secondaryOptions: Metrica[];
  selectedSecondaryId: number;
  onSecondaryChange: (metricId: number) => void;
  selectedParty: string | null;
  selectedGeografiaId?: number | null;
  onPointClick: (geografiaId: number, nombre: string) => void;
  rangeFilterActive?: boolean;
}

export function CruceScatter({
  electoralData,
  secondaryData,
  secondaryOptions,
  selectedSecondaryId,
  onSecondaryChange,
  selectedParty,
  selectedGeografiaId = null,
  onPointClick,
  rangeFilterActive = false,
}: CruceScatterProps) {
  const secondaryName = secondaryOptions.find(m => m.id === selectedSecondaryId)?.nombre_amigable ?? "Métrica";
  const yLabel = selectedParty
    ? `% ${selectedParty}`
    : "% del ganador";

  const points = useMemo(
    () => buildCrucePoints(electoralData, secondaryData, selectedParty),
    [electoralData, secondaryData, selectedParty],
  );

  const pearson = useMemo(
    () => pearsonCorrelation(points.map(p => p.x), points.map(p => p.y)),
    [points],
  );

  const renderDot = (props: {
    cx?: number;
    cy?: number;
    payload?: CrucePoint;
  }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return null;
    const selected = payload.geografia_id === selectedGeografiaId;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={selected ? 7 : 4}
        fill={getPartyColor(payload.partido)}
        stroke={selected ? "#111827" : "rgba(0,0,0,0.25)"}
        strokeWidth={selected ? 2 : 0.5}
        style={{ cursor: "pointer" }}
        onClick={() => onPointClick(payload.geografia_id, payload.nombre)}
      />
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Cruce provincial
            </CardTitle>
            <CardDescription className="text-sm">
              {secondaryName} × {yLabel}
              {pearson !== null
                ? ` · r = ${pearson.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : points.length < PEARSON_MIN_POINTS
                  ? ` · ${points.length} municipios (r desde ${PEARSON_MIN_POINTS})`
                  : ""}
            </CardDescription>
          </div>
          {secondaryOptions.length > 1 && (
            <Select
              value={String(selectedSecondaryId)}
              onValueChange={(value) => onSecondaryChange(Number(value))}
            >
              <SelectTrigger className="w-[180px] shrink-0">
                <SelectValue placeholder="Cruzar con..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {secondaryOptions.map(metric => (
                  <SelectItem key={metric.id} value={String(metric.id)}>
                    {metric.nombre_amigable}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay municipios con ambas métricas para armar el cruce.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={secondaryName}
                  tickFormatter={(v: number) => formatCompact(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yLabel}
                  unit="%"
                  tickFormatter={(v: number) => `${v.toFixed(0)}`}
                  tick={{ fontSize: 11 }}
                  domain={[0, (dataMax: number) => Math.min(100, Math.ceil(dataMax + 5))]}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    const point = payload?.[0]?.payload as CrucePoint | undefined;
                    if (!point) return null;
                    return (
                      <div className="rounded-md border border-border bg-card px-2 py-1.5 text-xs shadow-sm">
                        <p className="font-medium">{point.nombre}</p>
                        <p className="text-muted-foreground">
                          {secondaryName}: {formatCompact(point.x)}
                        </p>
                        <p className="text-muted-foreground">
                          {yLabel}: {point.y.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }}
                />
                <Scatter data={points} shape={renderDot} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Clic en un punto para ver el municipio.
              {rangeFilterActive ? " La correlación usa los municipios que pasan el filtro de rango." : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
