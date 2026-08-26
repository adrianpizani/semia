"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FeedShell } from "@/components/feed-shell"
import { MOCK_INSIGHTS, MOCK_METRICS_FROM_FEEDS } from "@/lib/feed-mock"
import { Sparkles } from "lucide-react"

export default function FeedIaPage() {
  return (
    <FeedShell
      title="Motor IA"
      description="Sugerencias de cruces y hallazgos anclados a tus métricas cargadas. Cada insight puede materializarse como métrica derivada para el mapa y el análisis tabular."
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hallazgos sugeridos (demo)</CardTitle>
            <CardDescription>Siempre con evidencia citada — no inventar hechos fuera de Semia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_INSIGHTS.map((insight) => (
              <article key={insight.id} className="rounded-lg border border-border/70 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <h3 className="text-sm font-semibold">{insight.titulo}</h3>
                  <Badge
                    variant="secondary"
                    className={
                      insight.confianza === "alta"
                        ? "bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15"
                        : "bg-amber-500/15 text-amber-800 hover:bg-amber-500/15"
                    }
                  >
                    Confianza {insight.confianza}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{insight.detalle}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{insight.evidencia}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    → {insight.metricaSugerida}
                  </Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                    Publicar métrica
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Métricas derivadas</CardTitle>
              <CardDescription>Listas para activar en Gestión de métricas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_METRICS_FROM_FEEDS.ia.map((m) => (
                <div key={m.nombre} className="flex items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">{m.tipo} · {m.cobertura}</p>
                  </div>
                  <Badge variant={m.estado === "lista" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {m.estado === "lista" ? "Lista" : "Borrador"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-dashed border-primary/25 bg-white/80 shadow-sm">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              En producción: el modelo solo razona sobre hechos ya cargados; el output es una métrica (valor por geografía) o un cruce sugerido en /análisis.
            </CardContent>
          </Card>
        </div>
      </div>
    </FeedShell>
  )
}
