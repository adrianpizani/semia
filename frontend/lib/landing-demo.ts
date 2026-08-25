export type LandingDemoMode =
  | null
  | "mapa"
  | "cruce"
  | "analisis"
  | "gestion"
  | "social"
  | "ia"

export const LANDING_FEATURES = [
  {
    id: "mapa" as const,
    title: "Mapa electoral",
    description: "Visualizá partidos y circuitos con colores por fuerza política.",
    soon: false,
  },
  {
    id: "cruce" as const,
    title: "Cruce de métricas",
    description: "Relacioná resultados electorales con indicadores socioeconómicos.",
    soon: false,
  },
  {
    id: "analisis" as const,
    title: "Análisis tabular",
    description: "Rankings, filtros y búsqueda avanzada por municipio.",
    soon: false,
  },
  {
    id: "gestion" as const,
    title: "Gestión de datos",
    description: "Importá datasets y configurá métricas personalizadas.",
    soon: false,
  },
  {
    id: "social" as const,
    title: "Feed social",
    description: "Seguí conversaciones y menciones territoriales en redes.",
    soon: true,
  },
  {
    id: "ia" as const,
    title: "Motor IA",
    description: "Sugerencias inteligentes y hallazgos a partir de tus datos.",
    soon: true,
  },
] as const
