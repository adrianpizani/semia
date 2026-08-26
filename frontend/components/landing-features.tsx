"use client"

import { Brain, Globe, Map, ScatterChart, Share2, Table2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { LANDING_FEATURES, type LandingDemoMode } from "@/lib/landing-demo"

const ICONS = {
  mapa: Map,
  cruce: ScatterChart,
  analisis: Table2,
  gestion: Upload,
  social: Share2,
  web: Globe,
  ia: Brain,
} as const

type Props = {
  className?: string
  activeDemo?: LandingDemoMode
  onDemoChange?: (mode: LandingDemoMode) => void
}

export function LandingFeatures({ className, activeDemo = null, onDemoChange }: Props) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {LANDING_FEATURES.map(({ id, title, description, soon }) => {
        const Icon = ICONS[id]
        const isActive = activeDemo === id
        return (
          <div
            key={id}
            onMouseEnter={() => onDemoChange?.(id)}
            onMouseLeave={() => onDemoChange?.(null)}
            onFocus={() => onDemoChange?.(id)}
            onBlur={() => onDemoChange?.(null)}
            tabIndex={0}
            className={cn(
              "relative flex cursor-pointer gap-3 rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm transition-all",
              isActive
                ? "border-primary/40 bg-card ring-1 ring-primary/30"
                : "hover:bg-card/90",
              soon && "border-dashed",
            )}
          >
            {soon && (
              <span className="absolute right-2.5 top-2.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Próximamente
              </span>
            )}
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className={cn("min-w-0 space-y-0.5", soon && "pr-16")}>
              <h3 className="text-sm font-semibold leading-tight">{title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
