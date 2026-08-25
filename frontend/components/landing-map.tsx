"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { FeatureCollection } from "geojson"
import { geojsonToSvgPaths, type SvgPathFeature } from "@/lib/geo-to-svg"
import type { LandingDemoMode } from "@/lib/landing-demo"

const PARTY_FILLS = ["#1d4ed8", "#b91c1c", "#ca8a04", "#15803d", "#7c3aed", "#0e7490"] as const

function partyFill(nombre: string): string {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return PARTY_FILLS[h % PARTY_FILLS.length]
}

function demoLabel(mode: LandingDemoMode): string | null {
  switch (mode) {
    case "mapa":
      return "Demo · mapa electoral por fuerza"
    case "cruce":
      return "Demo · cruce electoral × socioeconómico"
    case "analisis":
      return "Demo · ranking de municipios"
    case "gestion":
      return "Demo · dataset importado"
    case "social":
      return "Próximamente · feed social territorial"
    case "ia":
      return "Próximamente · hallazgos con IA"
    default:
      return null
  }
}

type Props = {
  demoMode?: LandingDemoMode
}

export function LandingMap({ demoMode = null }: Props) {
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

  // Ranking demo: top 5 por hash estable del nombre
  const rankedIds = useMemo(() => {
    const scored = paths.map((p) => {
      let h = 0
      for (let i = 0; i < p.nombre.length; i++) h = (h * 33 + p.nombre.charCodeAt(i)) >>> 0
      return { id: p.id, score: h % 1000, path: p }
    })
    return scored.sort((a, b) => b.score - a.score).slice(0, 5)
  }, [paths])

  const rankedSet = useMemo(() => new Set(rankedIds.map((r) => r.id)), [rankedIds])

  // Gestión demo: un municipio “activo” + vecinos
  const gestionFocus = useMemo(() => {
    if (paths.length === 0) return null
    const mid = paths[Math.floor(paths.length * 0.42)]
    return mid
  }, [paths])

  const hoveredNombre = paths.find((p) => p.id === hoveredId)?.nombre ?? null
  const demoActive = demoMode !== null

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (demoActive || !hoveredNombre) {
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
    [hoveredNombre, demoActive],
  )

  const pathStyle = (p: SvgPathFeature, isHovered: boolean) => {
    if (demoMode === "mapa") {
      return {
        fill: partyFill(p.nombre),
        fillOpacity: isHovered ? 0.95 : 0.78,
        stroke: "#e2e8f0",
        strokeWidth: isHovered ? 1.6 : 0.55,
        strokeOpacity: 0.55,
      }
    }
    if (demoMode === "cruce") {
      const cold = "#0e7490"
      const hot = "#f59e0b"
      let h = 0
      for (let i = 0; i < p.nombre.length; i++) h = (h * 17 + p.nombre.charCodeAt(i)) >>> 0
      const t = (h % 100) / 100
      return {
        fill: t > 0.55 ? hot : cold,
        fillOpacity: 0.35 + t * 0.45,
        stroke: "#7dd3fc",
        strokeWidth: 0.45,
        strokeOpacity: 0.3,
      }
    }
    if (demoMode === "analisis") {
      const rank = rankedIds.findIndex((r) => r.id === p.id)
      const isTop = rank >= 0
      return {
        fill: isTop ? "#38bdf8" : "#164e63",
        fillOpacity: isTop ? 0.9 - rank * 0.1 : 0.28,
        stroke: isTop ? "#e0f2fe" : "#7dd3fc",
        strokeWidth: isTop ? 1.4 : 0.4,
        strokeOpacity: isTop ? 0.9 : 0.2,
      }
    }
    if (demoMode === "gestion") {
      const isFocus = gestionFocus?.id === p.id
      return {
        fill: isFocus ? "#22d3ee" : p.fill,
        fillOpacity: isFocus ? 0.95 : 0.35,
        stroke: isFocus ? "#ecfeff" : "#7dd3fc",
        strokeWidth: isFocus ? 2 : 0.4,
        strokeOpacity: isFocus ? 1 : 0.2,
      }
    }
    if (demoMode === "social") {
      let h = 0
      for (let i = 0; i < p.nombre.length; i++) h = (h * 19 + p.nombre.charCodeAt(i)) >>> 0
      const hot = h % 5 === 0
      return {
        fill: hot ? "#a855f7" : "#1e3a5f",
        fillOpacity: hot ? 0.75 : 0.32,
        stroke: hot ? "#e9d5ff" : "#7dd3fc",
        strokeWidth: hot ? 1.2 : 0.4,
        strokeOpacity: hot ? 0.85 : 0.2,
      }
    }
    if (demoMode === "ia") {
      let h = 0
      for (let i = 0; i < p.nombre.length; i++) h = (h * 23 + p.nombre.charCodeAt(i)) >>> 0
      const insight = h % 7 === 0
      return {
        fill: insight ? "#34d399" : "#0f2744",
        fillOpacity: insight ? 0.82 : 0.3,
        stroke: insight ? "#a7f3d0" : "#7dd3fc",
        strokeWidth: insight ? 1.5 : 0.4,
        strokeOpacity: insight ? 0.9 : 0.18,
      }
    }
    // idle
    return {
      fill: p.fill,
      fillOpacity: isHovered ? 0.92 : 0.62,
      stroke: isHovered ? "#e0f2fe" : "#7dd3fc",
      strokeWidth: isHovered ? 1.8 : 0.6,
      strokeOpacity: isHovered ? 0.95 : 0.35,
    }
  }

  const label = demoLabel(demoMode)

  // Puntos de cruce: muestra ~18 municipios
  const scatterPoints = useMemo(() => {
    if (demoMode !== "cruce") return []
    return paths.filter((_, i) => i % 8 === 0).slice(0, 18)
  }, [paths, demoMode])

  const socialMentions = useMemo(() => {
    if (demoMode !== "social") return []
    return paths.filter((_, i) => i % 11 === 0).slice(0, 10)
  }, [paths, demoMode])

  const iaInsights = useMemo(() => {
    if (demoMode !== "ia") return []
    return paths.filter((_, i) => i % 13 === 2).slice(0, 6)
  }, [paths, demoMode])

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
          <linearGradient id="cruce-trend" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {paths.length === 0 ? (
          <rect width="800" height="1000" fill="transparent" />
        ) : (
          paths.map((p) => {
            const isHovered = !demoActive && hoveredId === p.id
            const style = pathStyle(p, isHovered)
            const demoHighlight =
              (demoMode === "analisis" && rankedSet.has(p.id)) ||
              (demoMode === "gestion" && gestionFocus?.id === p.id)
            return (
              <path
                key={String(p.id)}
                d={p.d}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeOpacity={style.strokeOpacity}
                className={
                  isHovered || demoHighlight
                    ? "landing-municipio landing-municipio--active"
                    : "landing-municipio"
                }
                filter={isHovered || (demoMode === "gestion" && demoHighlight) ? "url(#landing-glow)" : undefined}
                onMouseEnter={() => {
                  if (!demoActive) setHoveredId(p.id)
                }}
              >
                <title>{p.nombre}</title>
              </path>
            )
          })
        )}

        {/* Demo cruce: puntos + línea de tendencia */}
        {demoMode === "cruce" && (
          <g className="landing-demo-overlay" pointerEvents="none">
            <line
              x1="120"
              y1="820"
              x2="680"
              y2="180"
              stroke="url(#cruce-trend)"
              strokeWidth="3"
              strokeDasharray="8 6"
            />
            {scatterPoints.map((p, i) => (
              <circle
                key={`sc-${String(p.id)}`}
                cx={p.cx}
                cy={p.cy}
                r={5}
                fill={i % 2 === 0 ? "#fbbf24" : "#38bdf8"}
                fillOpacity={0.9}
                stroke="#0c1f33"
                strokeWidth={1}
              >
                <animate attributeName="r" values="4;6;4" dur={`${1.6 + (i % 5) * 0.15}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        )}

        {/* Demo análisis: badges #1–#5 */}
        {demoMode === "analisis" && (
          <g className="landing-demo-overlay" pointerEvents="none">
            {rankedIds.map((r, i) => (
              <g key={`rk-${String(r.id)}`} transform={`translate(${r.path.cx}, ${r.path.cy})`}>
                <circle r="11" fill="#0c4a6e" stroke="#7dd3fc" strokeWidth="1.5" />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#e0f2fe"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* Demo gestión: chip de archivo */}
        {demoMode === "gestion" && gestionFocus && (
          <g className="landing-demo-overlay" pointerEvents="none">
            <circle cx={gestionFocus.cx} cy={gestionFocus.cy} r="18" fill="none" stroke="#67e8f9" strokeWidth="2" opacity="0.8">
              <animate attributeName="r" values="14;28;14" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2s" repeatCount="indefinite" />
            </circle>
            <foreignObject
              x={Math.min(gestionFocus.cx + 16, 560)}
              y={Math.max(gestionFocus.cy - 36, 40)}
              width="200"
              height="44"
            >
              <div className="rounded-md border border-cyan-400/40 bg-[#0c1f33]/95 px-2.5 py-1.5 text-[11px] font-medium text-cyan-50 shadow-sm">
                <div className="text-cyan-300/90">CSV · electoral_2023.csv</div>
                <div className="text-[10px] text-sky-200/70">{gestionFocus.nombre} · procesado</div>
              </div>
            </foreignObject>
          </g>
        )}

        {/* Demo social: menciones / burbujas */}
        {demoMode === "social" && (
          <g className="landing-demo-overlay" pointerEvents="none">
            {socialMentions.map((p, i) => {
              const count = 12 + (i * 7) % 40
              return (
                <g key={`soc-${String(p.id)}`}>
                  <circle cx={p.cx} cy={p.cy} r="6" fill="#c084fc" fillOpacity="0.9" stroke="#0c1f33" strokeWidth="1">
                    <animate attributeName="r" values="5;8;5" dur={`${1.4 + (i % 4) * 0.2}s`} repeatCount="indefinite" />
                  </circle>
                  <foreignObject x={p.cx + 10} y={p.cy - 22} width="120" height="36">
                    <div className="rounded-lg border border-purple-300/40 bg-[#1a1028]/92 px-2 py-1 text-[10px] text-purple-50 shadow-sm">
                      <div className="font-semibold text-purple-200">@{p.nombre.slice(0, 12)}</div>
                      <div className="text-purple-100/70">{count} menciones</div>
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </g>
        )}

        {/* Demo IA: hallazgos + barrido */}
        {demoMode === "ia" && (
          <g className="landing-demo-overlay" pointerEvents="none">
            <rect x="40" y="80" width="720" height="4" fill="#34d399" opacity="0.35" rx="2">
              <animate attributeName="y" values="80;880;80" dur="4.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.15;0.55;0.15" dur="4.5s" repeatCount="indefinite" />
            </rect>
            {iaInsights.map((p, i) => (
              <g key={`ia-${String(p.id)}`}>
                <circle cx={p.cx} cy={p.cy} r="14" fill="none" stroke="#6ee7b7" strokeWidth="1.5" opacity="0.7">
                  <animate attributeName="r" values="10;18;10" dur={`${2 + i * 0.25}s`} repeatCount="indefinite" />
                </circle>
                <foreignObject x={Math.min(p.cx + 12, 560)} y={Math.max(p.cy - 28, 50)} width="180" height="40">
                  <div className="rounded-md border border-emerald-400/40 bg-[#06241a]/92 px-2 py-1 text-[10px] text-emerald-50">
                    <div className="font-semibold text-emerald-300">Insight IA</div>
                    <div className="truncate text-emerald-100/75">Correlación atípica · {p.nombre}</div>
                  </div>
                </foreignObject>
              </g>
            ))}
          </g>
        )}
      </svg>

      {label && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-sky-400/30 bg-[#0c1f33]/85 px-3 py-1 text-[11px] font-medium tracking-wide text-sky-100 backdrop-blur-sm">
          {label}
        </div>
      )}

      {tooltip && !demoActive && (
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
