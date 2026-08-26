export type MockMetricPreview = {
  nombre: string
  tipo: string
  cobertura: string
  estado: "lista" | "borrador"
}

export type MockSocialPost = {
  id: string
  red: "X" | "Meta"
  autor: string
  texto: string
  partido: string
  municipio: string
  fecha: string
  engagement: number
}

export type MockNewsItem = {
  id: string
  portal: string
  titular: string
  tema: string
  partido: string | null
  municipio: string | null
  fecha: string
}

export type MockInsight = {
  id: string
  titulo: string
  detalle: string
  evidencia: string
  confianza: "alta" | "media"
  metricaSugerida: string
}

export const MOCK_SOCIAL_POSTS: MockSocialPost[] = [
  {
    id: "s1",
    red: "X",
    autor: "@vecino_la_matanza",
    texto: "Filas eternas en el hospital… ¿dónde está la gestión local?",
    partido: "UNION POR LA PATRIA",
    municipio: "La Matanza",
    fecha: "hace 2 h",
    engagement: 842,
  },
  {
    id: "s2",
    red: "Meta",
    autor: "Comercio Bahía",
    texto: "Seguridad en el centro: vecinos piden más presencia.",
    partido: "LA LIBERTAD AVANZA",
    municipio: "Bahía Blanca",
    fecha: "hace 5 h",
    engagement: 310,
  },
  {
    id: "s3",
    red: "X",
    autor: "@politica_pba",
    texto: "Debate por el PBG y el empleo industrial en el corredor norte.",
    partido: "JUNTOS POR EL CAMBIO",
    municipio: "Vicente López",
    fecha: "hace 1 d",
    engagement: 1204,
  },
  {
    id: "s4",
    red: "Meta",
    autor: "Radio Quilmes",
    texto: "Cierre de campaña: acto en la plaza con fuerte convocatoria.",
    partido: "UNION POR LA PATRIA",
    municipio: "Quilmes",
    fecha: "hace 1 d",
    engagement: 567,
  },
]

export const MOCK_NEWS: MockNewsItem[] = [
  {
    id: "n1",
    portal: "La Nación",
    titular: "El conurbano redefine alianzas de cara a la próxima elección",
    tema: "Elecciones",
    partido: "UNION POR LA PATRIA",
    municipio: null,
    fecha: "Hoy",
  },
  {
    id: "n2",
    portal: "Clarín",
    titular: "Inversión y empleo: el índice que miran los intendentes del interior",
    tema: "Economía",
    partido: null,
    municipio: "Tandil",
    fecha: "Ayer",
  },
  {
    id: "n3",
    portal: "Infobae",
    titular: "Seguridad: ranking de denuncias por partido bonaerense",
    tema: "Seguridad",
    partido: "LA LIBERTAD AVANZA",
    municipio: "Lomas de Zamora",
    fecha: "Ayer",
  },
  {
    id: "n4",
    portal: "Página/12",
    titular: "Territorio y voto: cómo se mueve el mapa del AMBA",
    tema: "Análisis",
    partido: "JUNTOS POR EL CAMBIO",
    municipio: null,
    fecha: "Hace 2 d",
  },
]

export const MOCK_INSIGHTS: MockInsight[] = [
  {
    id: "i1",
    titulo: "Correlación atípica PBG × % LLA",
    detalle: "En el quintil de PBG más alto, LLA supera su media provincial en +6,2 pp.",
    evidencia: "Basado en métricas activas: PBG 2023 + Presidente 2023 (generales).",
    confianza: "alta",
    metricaSugerida: "Residuo LLA vs PBG (por municipio)",
  },
  {
    id: "i2",
    titulo: "Bolsón de bajo rendimiento UxP",
    detalle: "8 municipios del interior con caída >8 pp vs elección anterior de diputados.",
    evidencia: "Comparativa Diputados 2021–2023 filtrada por votos positivos.",
    confianza: "media",
    metricaSugerida: "Delta UxP 2021→2023",
  },
  {
    id: "i3",
    titulo: "Cruce sugerido: densidad × participación",
    detalle: "La IA propone cruzar población con participación electoral en el conurbano sur.",
    evidencia: "Patrón detectado en 12 partidos contiguos.",
    confianza: "media",
    metricaSugerida: "Participación estimada (proxy)",
  },
]

export const MOCK_METRICS_FROM_FEEDS: Record<"social" | "web" | "ia", MockMetricPreview[]> = {
  social: [
    { nombre: "Menciones semanales por partido", tipo: "DEMOGRAFICA", cobertura: "135 municipios", estado: "borrador" },
    { nombre: "Sentimiento neto (demo)", tipo: "DEMOGRAFICA", cobertura: "AMBA", estado: "borrador" },
  ],
  web: [
    { nombre: "Cobertura mediática 7d", tipo: "DEMOGRAFICA", cobertura: "4 portales", estado: "borrador" },
    { nombre: "Menciones por tema (seguridad)", tipo: "DEMOGRAFICA", cobertura: "PBA", estado: "lista" },
  ],
  ia: [
    { nombre: "Residuo LLA vs PBG", tipo: "ECONOMICA", cobertura: "135 municipios", estado: "lista" },
    { nombre: "Delta UxP 2021→2023", tipo: "ELECTORAL", cobertura: "135 municipios", estado: "borrador" },
  ],
}
