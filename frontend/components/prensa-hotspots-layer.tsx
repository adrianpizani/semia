"use client"

import { useEffect, useMemo, useState } from "react"
import L from "leaflet"
import { Marker, Tooltip, useMap } from "react-leaflet"
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
  /** Escala 0–1 para tamaño del pin. */
  scale: number
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
  if (max <= 0) return 0.2
  const t = Math.max(0, Math.min(1, valor / max))
  // Curva más agresiva: los bajos quedan chicos, el tope se abre bien
  return Math.pow(t, 0.65)
}

function temaLabel(metricaNombre: string): string {
  return metricaNombre.replace(/^Prensa\s*[·•]\s*/i, "").trim() || metricaNombre
}

function pinSize(scale: number, selected: boolean): { w: number; h: number } {
  // Rango amplio: ~22px → ~56px según peso relativo
  const base = 22 + Math.max(0.08, scale) * 34
  const w = selected ? base + 4 : base
  return { w, h: w * 1.35 }
}

function buildPinIcon(p: PrensaHotspotPoint, selected: boolean): L.DivIcon {
  const { w, h } = pinSize(p.scale, selected)
  const label = formatCompact(p.valor)
  const fill = selected ? "#f59e0b" : "#fbbf24"
  const stroke = selected ? "#ffffff" : "#fffbeb"
  const fontSize = w < 30 ? 8 : w < 40 ? 10 : 12

  const html = `
    <div class="prensa-hotspot-pin${selected ? " is-selected" : ""}" style="width:${w}px;height:${h}px">
      <svg viewBox="0 0 40 54" width="${w}" height="${h}" aria-hidden="true">
        <path
          d="M20 52C20 52 4 34.5 4 20a16 16 0 1 1 32 0C36 34.5 20 52 20 52Z"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="2.2"
        />
        <circle cx="20" cy="19" r="11.5" fill="rgba(255,255,255,0.22)" />
      </svg>
      <span class="prensa-hotspot-pin__num" style="font-size:${fontSize}px">${label}</span>
    </div>
  `

  return L.divIcon({
    className: "prensa-hotspot-pin-wrap",
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    tooltipAnchor: [0, -h + 8],
  })
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
        scale: s,
        lat: center[0],
        lng: center[1],
      })
    }
  }
  // Más importantes encima
  return points.sort((a, b) => a.valor - b.valor)
}

export function PrensaHotspotsLayer({
  municipiosGeoJSON,
  metrics,
  dataByMetric,
  selectedGeografiaId = null,
  onSelect,
}: Props) {
  const paneReady = usePrensaPane()
  const points = useMemo(
    () => buildHotspotPoints(municipiosGeoJSON, metrics, dataByMetric),
    [municipiosGeoJSON, metrics, dataByMetric],
  )

  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>()
    for (const p of points) {
      const key = `${p.metrica_id}-${p.geografia_id}`
      const selected = selectedGeografiaId === p.geografia_id
      map.set(key, buildPinIcon(p, selected))
    }
    return map
  }, [points, selectedGeografiaId])

  if (!paneReady || points.length === 0) return null

  return (
    <>
      {points.map((p) => {
        const key = `${p.metrica_id}-${p.geografia_id}`
        const icon = icons.get(key)!
        const { h } = pinSize(p.scale, selectedGeografiaId === p.geografia_id)
        return (
          <Marker
            key={key}
            position={[p.lat, p.lng]}
            icon={icon}
            pane={PANE}
            zIndexOffset={Math.round(p.scale * 200)}
            eventHandlers={{
              click: (e) => {
                e.originalEvent?.stopPropagation()
                onSelect?.(p.geografia_id, p.nombre)
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -(h - 6)]}
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
          </Marker>
        )
      })}
    </>
  )
}
