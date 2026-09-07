"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FeedShell } from "@/components/feed-shell"
import {
  fetchFeedWebNow,
  getFeedWebSummary,
  listFeedWebItems,
  listFeedWebSources,
  listFeedWebTags,
  type FeedSource,
  type FeedWebItem,
  type FeedWebSummary,
  type FeedWebTag,
} from "@/lib/api"

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function FeedWebPage() {
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [items, setItems] = useState<FeedWebItem[]>([])
  const [sources, setSources] = useState<FeedSource[]>([])
  const [tags, setTags] = useState<FeedWebTag[]>([])
  const [summary, setSummary] = useState<FeedWebSummary | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sourceId = sourceFilter === "all" ? undefined : Number(sourceFilter)
      const tag = tagFilter === "all" ? undefined : tagFilter
      const [itemsRes, sourcesRes, tagsRes, summaryRes] = await Promise.all([
        listFeedWebItems({ source_id: sourceId, tag, limit: 80 }),
        listFeedWebSources(),
        listFeedWebTags(),
        getFeedWebSummary(),
      ])
      setItems(itemsRes)
      setSources(sourcesRes)
      setTags(tagsRes)
      setSummary(summaryRes)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar el feed web")
    } finally {
      setLoading(false)
    }
  }, [sourceFilter, tagFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleFetch = async () => {
    setFetching(true)
    try {
      const result = await fetchFeedWebNow()
      toast.success(
        `Actualizado: +${result.inserted} titulares` +
          (result.purged ? ` · ${result.purged} fuera de retención` : ""),
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar")
    } finally {
      setFetching(false)
    }
  }

  return (
    <FeedShell
      live
      title="Feed web"
      description="Titulares RSS recolectados y etiquetados por diccionario. Fase 1: ver y filtrar; aún no se publica métrica al mapa."
      actions={
        <>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[180px] bg-white hover:bg-white">
              <SelectValue placeholder="Portal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los portales</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[200px] bg-white hover:bg-white">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.texto}>
                  {t.texto}
                  {t.count != null ? ` (${t.count})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-primary"
            onClick={handleFetch}
            disabled={fetching || loading}
          >
            {fetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Actualizar ahora
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-border/80 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Titulares</CardTitle>
            <CardDescription>
              {loading
                ? "Cargando…"
                : `${items.length} mostrados · filtros por portal y tags ya descubiertos`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando titulares…
              </div>
            )}
            {!loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay titulares. Configurá fuentes en{" "}
                <Link href="/configuracion" className="underline underline-offset-2">
                  Configuración → Web
                </Link>{" "}
                y pulsá «Actualizar ahora».
              </p>
            )}
            {!loading &&
              items.map((item) => (
                <article key={item.id} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{item.source_nombre}</Badge>
                    <span>{formatWhen(item.publicado_at)}</span>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-snug hover:underline"
                  >
                    {item.titulo}
                  </a>
                  {item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.map((t) => (
                        <Badge
                          key={t.id}
                          variant="secondary"
                          className="cursor-pointer text-[10px]"
                          onClick={() => setTagFilter(t.texto)}
                        >
                          {t.texto}
                          {t.tipo ? ` · ${t.tipo}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </article>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen</CardTitle>
              <CardDescription>Corpus recolectado en esta fase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Ítems</p>
                  <p className="text-lg font-semibold tabular-nums">{summary?.items_count ?? "—"}</p>
                </div>
                <div className="rounded-md border border-border/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Fuentes activas</p>
                  <p className="text-lg font-semibold tabular-nums">{summary?.sources_active ?? "—"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Última actualización: {formatWhen(summary?.ultimo_fetch_at)}
              </p>
              {summary && summary.top_tags.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Top tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.top_tags.map((t) => (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className="cursor-pointer text-[10px]"
                        onClick={() => setTagFilter(t.texto)}
                      >
                        {t.texto}
                        {t.count != null ? ` · ${t.count}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed border-primary/25 bg-white/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Métricas (próxima fase)</CardTitle>
              <CardDescription>
                Todavía no se publica nada al mapa ni al catálogo de métricas.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Intención: agregar “de qué se habla” por municipio (ocurrencia o importancia
              ponderada por fuente/recencia) cuando haya corpus estable. Fuentes y políticas
              viven en{" "}
              <Link href="/configuracion" className="underline underline-offset-2">
                Configuración → Web
              </Link>
              .
            </CardContent>
          </Card>
        </div>
      </div>
    </FeedShell>
  )
}
