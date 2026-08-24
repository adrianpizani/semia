import type { FeatureCollection, Geometry, Position } from "geojson"

export interface SvgPathFeature {
  id: string | number
  d: string
  nombre: string
  fill: string
}

const CHOROPLETH_FILLS = [
  "#155e75",
  "#0e7490",
  "#0891b2",
  "#0284c7",
  "#0369a1",
  "#1e6b8a",
  "#164e63",
  "#0c4a6e",
] as const

export function hashChoroplethFill(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return CHOROPLETH_FILLS[h % CHOROPLETH_FILLS.length]
}

function visitPositions(geom: Geometry, fn: (p: Position) => void) {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) {
      for (const p of ring) fn(p)
    }
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        for (const p of ring) fn(p)
      }
    }
  }
}

export function computeBBox(
  fc: FeatureCollection,
): [minLon: number, minLat: number, maxLon: number, maxLat: number] {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  for (const feature of fc.features) {
    if (!feature.geometry) continue
    visitPositions(feature.geometry, ([lon, lat]) => {
      if (lon < minLon) minLon = lon
      if (lat < minLat) minLat = lat
      if (lon > maxLon) maxLon = lon
      if (lat > maxLat) maxLat = lat
    })
  }

  return [minLon, minLat, maxLon, maxLat]
}

function ringToPath(
  ring: Position[],
  project: (p: Position) => [number, number],
): string {
  if (ring.length === 0) return ""
  const [x0, y0] = project(ring[0])
  let d = `M ${x0.toFixed(2)} ${y0.toFixed(2)}`
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = project(ring[i])
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return `${d} Z`
}

function geometryToPath(
  geom: Geometry,
  project: (p: Position) => [number, number],
): string {
  if (geom.type === "Polygon") {
    return geom.coordinates.map((ring) => ringToPath(ring, project)).join(" ")
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates
      .map((poly) => poly.map((ring) => ringToPath(ring, project)).join(" "))
      .join(" ")
  }
  return ""
}

export function geojsonToSvgPaths(
  fc: FeatureCollection,
  width = 800,
  height = 1000,
  padding = 28,
): { viewBox: string; paths: SvgPathFeature[] } {
  const [minLon, minLat, maxLon, maxLat] = computeBBox(fc)
  const lonSpan = maxLon - minLon || 1
  const latSpan = maxLat - minLat || 1

  const project = (p: Position): [number, number] => {
    const x = padding + ((p[0] - minLon) / lonSpan) * (width - padding * 2)
    const y = padding + (1 - (p[1] - minLat) / latSpan) * (height - padding * 2)
    return [x, y]
  }

  const paths: SvgPathFeature[] = fc.features
    .filter((f) => f.geometry)
    .map((feature, index) => {
      const nombre = String(feature.properties?.nombre ?? "")
      return {
        id: feature.id ?? index,
        d: geometryToPath(feature.geometry!, project),
        nombre,
        fill: hashChoroplethFill(nombre || String(index)),
      }
    })

  return { viewBox: `0 0 ${width} ${height}`, paths }
}
