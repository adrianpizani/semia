import { Map, ScatterChart, Table2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const features = [
  {
    icon: Map,
    title: "Mapa electoral",
    description: "Visualizá partidos y circuitos con colores por fuerza política.",
  },
  {
    icon: ScatterChart,
    title: "Cruce de métricas",
    description: "Relacioná resultados electorales con indicadores socioeconómicos.",
  },
  {
    icon: Table2,
    title: "Análisis tabular",
    description: "Rankings, filtros y búsqueda avanzada por municipio.",
  },
  {
    icon: Upload,
    title: "Gestión de datos",
    description: "Importá datasets y configurá métricas personalizadas.",
  },
] as const

export function LandingFeatures({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {features.map(({ icon: Icon, title, description }) => (
        <div
          key={title}
          className="flex gap-3 rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm transition-colors hover:bg-card/90"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
