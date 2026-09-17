"use client"

import { Map, MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MapModo } from "@/hooks/use-map-view"

const OPTIONS: {
  value: MapModo
  title: string
  subtitle: string
  Icon: typeof Map
}[] = [
  {
    value: "pba",
    title: "Buenos Aires",
    subtitle: "Partidos de la provincia · capa PBA",
    Icon: MapPinned,
  },
  {
    value: "nacional",
    title: "Nacional",
    subtitle: "24 provincias · sin circuitos",
    Icon: Map,
  },
]

export function MapModeSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: MapModo
  onChange: (modo: MapModo) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value: option, title, subtitle, Icon }) => {
        const selected = value === option
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "flex min-h-[7.5rem] flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border/80 bg-white hover:border-primary/40",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Icon className={cn("h-8 w-8", selected ? "text-primary" : "text-muted-foreground")} />
            <div>
              <div className="text-base font-semibold tracking-tight">{title}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function nivelForMapMode(mode: MapModo): string {
  return mode === "nacional" ? "Provincia" : "Partido"
}

export function labelForNivel(nivel: string | null | undefined): string {
  if (!nivel) return "Sin datos"
  if (nivel === "Partido") return "Partido (PBA)"
  if (nivel === "Provincia") return "Provincia"
  return nivel
}
