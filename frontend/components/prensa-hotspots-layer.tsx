"use client"

import { useEffect, useMemo, useState, Fragment } from "react"
import { CircleMarker, Tooltip, useMap } from "react-leaflet"
import type { FeatureCollection } from "geojson"
import { buildCentroidIndex, scoreToStars, starsLabel } from "@/lib/prensa-hotspots"
import { formatCompact } from "@/lib/range-utils"
import type { GenericData, Metrica } from "@/lib/types"

export type PrensaHotspotPoint = {
  geografia_id: number
  nombre: string
  valor: number
  metrica_id: number
  metrica_nombre: string
  stars: number
  rank: number
  radius: number
  lat: number
  lng: number
}

type Props = {
  municipiosGeoJSON: FeatureCollection | null
  metrics: Metrica[]
  dataByMetric: Record<number, GenericData[]>
  selectedGeografiaId?: number | null
  onSelect?: (geografiaId: number, nombre: string) => void
}

const PANE = "prensaHotspots"

function importanceScale(valor: number, max: number): number {
  if (max <= 0) return 0.35
  const t = Math.max(0, Math.min(1, valor / max))
  return 0.25 + Math.pow(t, 0.5) * 0.75
}

function temaLabel(metricaNombre: string): string {
  return metricaNombre.replace(/^Prensa\s*[·•]\s*/i, "").trim() || metricaNombre
}

function usePrensaPane(): boolean {
  const map = useMap()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let pane = map.getPane(PANE)
    if (!pane) {
      pane = map.createPane(PANE)
      pane.style.zIndex = "650"
      pane.style.pointerEvents = "auto"
    }
    setReady(true)
  }, [map])

  return ready
}

/** Pulso 0→1→0 ~cada 2s (12 fps: suficiente y no tumba React). */
function usePulsePhase(): number {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const id = window.setInterval(() => {
      const t = ((performance.now() - start) % 2000) / 2000
      setPhase(0.5 - 0.5 * Math.cos(t * Math.PI * 2))
    }, 80)
    return () => window.clearInterval(id)
  }, [])
  return phase
}

export function buildHotspotPoints(
  municipiosGeoJSON: FeatureCollection | null,
  metrics: Metrica[],
  dataByMetric: Record<number, GenericData[]>,
): PrensaHotspotPoint[] {
  const centroids = buildCentroidIndex(municipiosGeoJSON)
  const points: PrensaHotspotPoint[] = []

  for (const metric of metrics) {
    const rows = (dataByMetric[metric.id] ?? []).filter(
      (r) => r.valor !== null && Number.isFinite(r.valor) && (r.valor as number) > 0,
    )
    if (rows.length === 0) continue
    const max = Math.max(...rows.map((r) => r.valor as number))
    const ranked = [...rows].sort((a, b) => (b.valor as number) - (a.valor as number))
    const rankById = new Map(ranked.map((r, i) => [r.geografia_id, i + 1]))

    for (const row of rows) {
      const center = centroids.get(row.geografia_id)
      if (!center) continue
      const valor = row.valor as number
      const s = importanceScale(valor, max)
      points.push({
        geografia_id: row.geografia_id,
        nombre: row.geografia_nombre,
        valor,
        metrica_id: metric.id,
        metrica_nombre: metric.nombre_amigable,
        stars: scoreToStars(valor, max),
        rank: rankById.get(row.geografia_id) ?? 99,
        radius: 7 + s * 7,
        lat: center[0],
        lng: center[1],
      })
    }
  }
  return points
}

export function PrensaHotspotsLayer({
  municipiosGeoJSON,
  metrics,
  dataByMetric,
  selectedGeografiaId = null,
  onSelect,
}: Props) {
  const paneReady = usePrensaPane()
  const phase = usePulsePhase()
  const points = useMemo(
    () => buildHotspotPoints(municipiosGeoJSON, metrics, dataByMetric),
    [municipiosGeoJSON, metrics, dataByMetric],
  )

  if (!paneReady || points.length === 0) return null

  return (
    <>
      {points.map((p) => {
        const selected = selectedGeografiaId === p.geografia_id
        const ringR = p.radius * (1.15 + phase * 0.55)
        const ringOpacity = 0.75 - phase * 0.55
        return (
          <Fragment key={`${p.metrica_id}-${p.geografia_id}`}>
            {/* Anillo que crece (solo visual) */}
            <CircleMarker
              center={[p.lat, p.lng]}
              radius={ringR}
              pane={PANE}
              pathOptions={{
                interactive: false,
                stroke: true,
                color: "#fbbf24",
                weight: 1.5,
                opacity: ringOpacity,
                fill: false,
                fillOpacity: 0,
              }}
            />
            {/* Núcleo relleno: visible + click/hover en toda el área */}
            <CircleMarker
              center={[p.lat, p.lng]}
              radius={selected ? p.radius + 2 : p.radius}
              pane={PANE}
              pathOptions={{
                stroke: true,
                color: "#ffffff",
                weight: 1.5,
                opacity: 0.9,
                fill: true,
                fillColor: selected ? "#f59e0b" : "#fbbf24",
                fillOpacity: 0.72,
              }}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation()
                  onSelect?.(p.geografia_id, p.nombre)
                },
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -(p.radius + 6)]}
                opacity={1}
                className="prensa-hotspot-tooltip"
              >
                <div className="prensa-hotspot-chip">
                  <div className="prensa-hotspot-chip__kicker">
                    Noticia · {temaLabel(p.metrica_nombre)}
                  </div>
                  <div className="prensa-hotspot-chip__title">{p.nombre}</div>
                  <div className="prensa-hotspot-chip__meta">
                    {formatCompact(p.valor)} · {starsLabel(p.stars)}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        )
      })}
    </>
  )
}
