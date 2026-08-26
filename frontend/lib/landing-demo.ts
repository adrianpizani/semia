export type LandingDemoMode =
  | null
  | "mapa"
  | "cruce"
  | "analisis"
  | "gestion"
  | "social"
  | "web"
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
    description: "Menciones en redes que se convierten en métricas territoriales.",
    soon: true,
  },
  {
    id: "web" as const,
    title: "Feed web",
    description: "Noticias y portales convertidos en señales por partido o tema.",
    soon: true,
  },
  {
    id: "ia" as const,
    title: "Motor IA",
    description: "Hallazgos y cruces sugeridos a partir de tus datos cargados.",
    soon: true,
  },
] as const
