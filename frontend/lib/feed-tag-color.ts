import { getPartyColor, hashString } from "@/lib/party-color"

/** Paleta fija de temas del feed — sin colores duplicados. */
const TEMA_COLORS: Record<string, string> = {
  Pobreza: "#B45309",
  Inflación: "#DC2626",
  Seguridad: "#1D4ED8",
  Educación: "#0F766E",
  Salud: "#DB2777",
  Empleo: "#15803D",
  Desempleo: "#A16207",
  Vivienda: "#7C3AED",
  Tarifas: "#EA580C",
  Dólar: "#0891B2",
  Elecciones: "#4F46E5",
  Congreso: "#334155",
  Gobierno: "#0369A1",
}

/** Reserva para temas nuevos del diccionario (también únicos entre sí). */
const TEMA_FALLBACK_PALETTE = [
  "#BE185D",
  "#047857",
  "#9333EA",
  "#C2410C",
  "#0E7490",
  "#4338CA",
  "#B91C1C",
  "#166534",
  "#9A3412",
  "#6D28D9",
] as const

const usedTemaFallback = new Map<string, string>()

function normalizeKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "")
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color
    return hexToRgba(hex, alpha)
  }
  if (color.startsWith("hsl(")) {
    return color.replace(/^hsl\(/, "hsla(").replace(/\)$/, `, ${alpha})`)
  }
  return color
}

function getTemaColor(texto: string): string {
  const exact = TEMA_COLORS[texto]
  if (exact) return exact
  const byNorm = Object.entries(TEMA_COLORS).find(
    ([name]) => normalizeKey(name) === normalizeKey(texto),
  )
  if (byNorm) return byNorm[1]

  const key = normalizeKey(texto)
  const cached = usedTemaFallback.get(key)
  if (cached) return cached

  const used = new Set([
    ...Object.values(TEMA_COLORS),
    ...usedTemaFallback.values(),
  ])
  for (const candidate of TEMA_FALLBACK_PALETTE) {
    if (!used.has(candidate)) {
      usedTemaFallback.set(key, candidate)
      return candidate
    }
  }
  const hue = hashString(key) % 360
  const generated = `hsl(${hue}, 58%, 42%)`
  usedTemaFallback.set(key, generated)
  return generated
}

function getMunicipioColor(texto: string): string {
  const hue = hashString(normalizeKey(texto)) % 360
  return `hsl(${hue}, 42%, 46%)`
}

function getOtroColor(texto: string): string {
  const hue = (hashString(normalizeKey(texto)) + 40) % 360
  return `hsl(${hue}, 35%, 48%)`
}

export function getFeedTagColor(
  texto: string,
  tipo?: string | null,
): string {
  const t = (tipo || "otro").toLowerCase()
  if (t === "tema") return getTemaColor(texto)
  if (t === "partido") return getPartyColor(texto)
  if (t === "municipio") return getMunicipioColor(texto)
  return getOtroColor(texto)
}

export type FeedTagBadgeStyle = {
  backgroundColor: string
  borderColor: string
  color: string
}

/** Estilo de chip: fondo suave + borde/texto en el color del tag. */
export function getFeedTagBadgeStyle(
  texto: string,
  tipo?: string | null,
): FeedTagBadgeStyle {
  const base = getFeedTagColor(texto, tipo)
  return {
    backgroundColor: colorWithAlpha(base, 0.16),
    borderColor: colorWithAlpha(base, 0.5),
    color: base,
  }
}
