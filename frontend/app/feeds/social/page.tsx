"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FeedShell } from "@/components/feed-shell"
import { MOCK_METRICS_FROM_FEEDS, MOCK_SOCIAL_POSTS } from "@/lib/feed-mock"

export default function FeedSocialPage() {
  return (
    <FeedShell
      title="Feed social"
      description="Conectá Meta y X para capturar menciones territoriales. Lo que se genera acá puede publicarse como métrica secundaria en el mapa y el análisis."
      actions={
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px] bg-white hover:bg-white">
            <SelectValue placeholder="Red" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las redes</SelectItem>
            <SelectItem value="x">X</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Timeline (demo)</CardTitle>
            <CardDescription>Posts ficticios anclados a partido y municipio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_SOCIAL_POSTS.map((post) => (
              <article key={post.id} className="rounded-lg border border-border/70 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{post.red}</Badge>
                  <span className="font-medium text-foreground">{post.autor}</span>
                  <span>·</span>
                  <span>{post.fecha}</span>
                  <span className="ml-auto tabular-nums">{post.engagement} interacciones</span>
                </div>
                <p className="text-sm leading-relaxed">{post.texto}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{post.partido}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{post.municipio}</Badge>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Métricas generadas</CardTitle>
              <CardDescription>
                Destino: Gestión de métricas → activar → consumir en mapa / análisis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {MOCK_METRICS_FROM_FEEDS.social.map((m) => (
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
              En producción: OAuth Meta/X, agregación por municipio y publicación como hechos numéricos (misma tubería que un CSV).
            </CardContent>
          </Card>
        </div>
      </div>
    </FeedShell>
  )
}
