"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FeedShell } from "@/components/feed-shell"
import { MOCK_METRICS_FROM_FEEDS, MOCK_NEWS } from "@/lib/feed-mock"

export default function FeedWebPage() {
  return (
    <FeedShell
      title="Feed web"
      description="Monitoreá portales y notas. Cada cobertura puede convertirse en una señal agregada (menciones por tema, partido o municipio) usable en el mapa."
      actions={
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px] bg-white hover:bg-white">
            <SelectValue placeholder="Portal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los portales</SelectItem>
            <SelectItem value="ln">La Nación</SelectItem>
            <SelectItem value="clarin">Clarín</SelectItem>
            <SelectItem value="infobae">Infobae</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Noticias (demo)</CardTitle>
            <CardDescription>Titulares mock con ancla a tema / partido / municipio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_NEWS.map((item) => (
              <article key={item.id} className="rounded-lg border border-border/70 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{item.portal}</Badge>
                  <span>{item.fecha}</span>
                  <Badge variant="secondary" className="text-[10px]">{item.tema}</Badge>
                </div>
                <p className="text-sm font-medium leading-snug">{item.titular}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.partido && (
                    <Badge variant="secondary" className="text-[10px]">{item.partido}</Badge>
                  )}
                  {item.municipio && (
                    <Badge variant="secondary" className="text-[10px]">{item.municipio}</Badge>
                  )}
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Métricas generadas</CardTitle>
              <CardDescription>Publicables al catálogo de métricas de Semia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_METRICS_FROM_FEEDS.web.map((m) => (
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
              En producción: preferir RSS/API; scraping solo donde haga falta, siempre con fuente y fecha.
            </CardContent>
          </Card>
        </div>
      </div>
    </FeedShell>
  )
}
