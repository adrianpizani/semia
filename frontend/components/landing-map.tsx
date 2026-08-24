"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FeatureCollection } from "geojson"
import { geojsonToSvgPaths } from "@/lib/geo-to-svg"

export function LandingMap() {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [hoveredId, setHoveredId] = useState<string | number | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; nombre: string } | null>(null)

  useEffect(() => {
    let active = true
    fetch("/partidos-landing.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el mapa")
        return res.json()
      })
      .then((data: FeatureCollection) => {
        if (active) setGeojson(data)
      })
      .catch((err) => console.error(err))
    return () => {
      active = false
    }
  }, [])

  const { viewBox, paths } = useMemo(
    () => (geojson ? geojsonToSvgPaths(geojson) : { viewBox: "0 0 800 1000", paths: [] }),
    [geojson],
  )

  const hoveredNombre = paths.find((p) => p.id === hoveredId)?.nombre ?? null

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!hoveredNombre) {
        setTooltip(null)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        nombre: hoveredNombre,
      })
    },
    [hoveredNombre],
  )

  return (
    <div className="absolute inset-0">
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoveredId(null)
          setTooltip(null)
        }}
        aria-label="Mapa de municipios de la Provincia de Buenos Aires"
      >
        <defs>
          <filter id="landing-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#67e8f9" floodOpacity="0.55" />
          </filter>
        </defs>

        {paths.length === 0 ? (
          <rect width="800" height="1000" fill="transparent" />
        ) : (
          paths.map(({ id, d, nombre, fill }) => {
            const isHovered = hoveredId === id
            return (
              <path
                key={String(id)}
                d={d}
                fill={fill}
                fillOpacity={isHovered ? 0.92 : 0.62}
                stroke={isHovered ? "#e0f2fe" : "#7dd3fc"}
                strokeWidth={isHovered ? 1.8 : 0.6}
                strokeOpacity={isHovered ? 0.95 : 0.35}
                className={isHovered ? "landing-municipio landing-municipio--active" : "landing-municipio"}
                filter={isHovered ? "url(#landing-glow)" : undefined}
                onMouseEnter={() => setHoveredId(id)}
              >
                <title>{nombre}</title>
              </path>
            )
          })
        )}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-sky-400/30 bg-[#0c1f33]/90 px-2.5 py-1.5 text-xs font-medium text-sky-100 shadow-lg backdrop-blur-sm"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          {tooltip.nombre}
        </div>
      )}
    </div>
  )
}
