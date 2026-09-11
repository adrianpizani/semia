import type { Feature, FeatureCollection, Geometry, Position } from "geojson"

/** Centroide simple (promedio de vértices) para ubicar hotspots. */
export function geometryCentroid(geometry: Geometry): [number, number] | null {
  const rings: Position[] = []

  const collect = (coords: Position[] | Position[][] | Position[][][]) => {
    if (!Array.isArray(coords) || coords.length === 0) return
    const first = coords[0]
    if (typeof first === "number") {
      rings.push(coords as Position)
      return
    }
    for (const c of coords as Position[][] | Position[][][]) {
      collect(c as Position[] | Position[][] | Position[][][])
    }
  }

  if (geometry.type === "Point") {
    return [geometry.coordinates[1], geometry.coordinates[0]]
  }
  if (geometry.type === "GeometryCollection") {
    for (const g of geometry.geometries) {
      const c = geometryCentroid(g)
      if (c) return c
    }
    return null
  }
  collect(geometry.coordinates as Position[] | Position[][] | Position[][][])
  if (rings.length === 0) return null

  let sumLat = 0
  let sumLng = 0
  for (const [lng, lat] of rings) {
    sumLng += lng
    sumLat += lat
  }
  return [sumLat / rings.length, sumLng / rings.length]
}

export function buildCentroidIndex(
  geojson: FeatureCollection | null,
): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>()
  if (!geojson) return map
  for (const feature of geojson.features as Feature[]) {
    const rawId = feature.id ?? (feature.properties as { id?: number | string } | null)?.id
    const id = Number(rawId)
    if (!Number.isFinite(id) || !feature.geometry) continue
    const c = geometryCentroid(feature.geometry)
    if (c) map.set(id, c)
  }
  return map
}

/** 1–5 estrellas según valor relativo al máximo de la métrica. */
export function scoreToStars(value: number, max: number, maxStars = 5): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(max) || max <= 0) return 1
  return Math.max(1, Math.min(maxStars, Math.round((value / max) * maxStars)))
}

export function starsLabel(stars: number, maxStars = 5): string {
  if (stars <= 0) return "☆".repeat(maxStars)
  return "★".repeat(stars) + "☆".repeat(Math.max(0, maxStars - stars))
}
