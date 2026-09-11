"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Plus, RefreshCw, Sparkles, Tags, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { FeedShell } from "@/components/feed-shell"
import {
  createFeedWebDictEntry,
  deleteFeedWebDictEntry,
  deleteFeedWebItem,
  fetchFeedWebSource,
  getFeedWebSummary,
  listFeedWebDictionary,
  listFeedWebItems,
  listFeedWebSources,
  listFeedWebTags,
  publishFeedWebAgenda,
  purgeFeedWebRetention,
  retagFeedWebItem,
  setFeedWebItemTags,
  updateFeedWebDictEntry,
  type FeedSource,
  type FeedWebAgendaPublishResult,
  type FeedWebDictEntry,
  type FeedWebItem,
  type FeedWebSummary,
  type FeedWebTag,
} from "@/lib/api"
import { getFeedTagBadgeStyle, getFeedTagColor } from "@/lib/feed-tag-color"

const DICT_TIPOS = ["municipio", "partido", "tema", "otro"] as const

function FeedTagChip({
  texto,
  tipo,
  count,
  onRemove,
  onClick,
  disabled,
}: {
  texto: string
  tipo?: string | null
  count?: number | null
  onRemove?: () => void
  onClick?: () => void
  disabled?: boolean
}) {
  const style = getFeedTagBadgeStyle(texto, tipo)
  return (
    <Badge
      variant="outline"
      className="gap-1 border pr-1 text-[10px] font-medium"
      style={style}
    >
      <button
        type="button"
        className={onClick ? "hover:underline" : "cursor-default"}
        onClick={onClick}
        disabled={!onClick}
      >
        {texto}
        {tipo ? ` · ${tipo}` : ""}
        {count != null ? ` · ${count}` : ""}
      </button>
      {onRemove && (
        <button
          type="button"
          className="rounded-sm p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Quitar ${texto}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  )
}

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

type AgendaRow = {
  municipio: string
  temas: Array<{ texto: string; count: number }>
  total: number
}

/** Preview client-side: pares municipio×tema a partir de los titulares cargados. */
function buildAgendaPreview(items: FeedWebItem[]): AgendaRow[] {
  const byMuni = new Map<string, Map<string, number>>()
  for (const item of items) {
    const municipios = item.tags.filter((t) => t.tipo === "municipio").map((t) => t.texto)
    const temas = item.tags.filter((t) => t.tipo === "tema").map((t) => t.texto)
    if (municipios.length === 0 || temas.length === 0) continue
    for (const muni of municipios) {
      let temaMap = byMuni.get(muni)
      if (!temaMap) {
        temaMap = new Map()
        byMuni.set(muni, temaMap)
      }
      for (const tema of temas) {
        temaMap.set(tema, (temaMap.get(tema) || 0) + 1)
      }
    }
  }
  const rows: AgendaRow[] = []
  for (const [municipio, temaMap] of byMuni) {
    const temas = [...temaMap.entries()]
      .map(([texto, count]) => ({ texto, count }))
      .sort((a, b) => b.count - a.count)
    const total = temas.reduce((s, t) => s + t.count, 0)
    rows.push({ municipio, temas, total })
  }
  return rows.sort((a, b) => b.total - a.total).slice(0, 12)
}

function LinternaChip({ texto, count, max }: { texto: string; count: number; max: number }) {
  const style = getFeedTagBadgeStyle(texto, "tema")
  const intensity = max > 0 ? 0.35 + (count / max) * 0.65 : 0.5
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        ...style,
        opacity: intensity,
        boxShadow: `0 0 0 ${1 + Math.min(count, 4)}px ${style.borderColor}`,
      }}
      title={`${texto}: ${count}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: getFeedTagColor(texto, "tema") }}
      />
      {texto}
      <span className="tabular-nums opacity-80">{count}</span>
    </span>
  )
}

function ItemTagEditor({
  item,
  busy,
  onChange,
}: {
  item: FeedWebItem
  busy: boolean
  onChange: (next: FeedWebItem) => void
}) {
  const [draft, setDraft] = useState("")
  const [draftTipo, setDraftTipo] = useState<string>("tema")
  const [localBusy, setLocalBusy] = useState(false)
  const disabled = busy || localBusy

  const persist = async (tags: Array<{ texto: string; tipo?: string | null }>) => {
    setLocalBusy(true)
    try {
      const updated = await setFeedWebItemTags(item.id, tags)
      onChange(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar tags")
    } finally {
      setLocalBusy(false)
    }
  }

  const removeTag = async (tagId: number) => {
    await persist(item.tags.filter((t) => t.id !== tagId).map((t) => ({ texto: t.texto, tipo: t.tipo })))
  }

  const addTag = async () => {
    const texto = draft.trim()
    if (!texto) return
    const next = [
      ...item.tags.map((t) => ({ texto: t.texto, tipo: t.tipo })),
      { texto, tipo: draftTipo },
    ]
    await persist(next)
    setDraft("")
  }

  const retag = async () => {
    setLocalBusy(true)
    try {
      const updated = await retagFeedWebItem(item.id)
      onChange(updated)
      toast.success("Diccionario reaplicado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reaplicar")
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {item.tags.map((t) => (
          <FeedTagChip
            key={t.id}
            texto={t.texto}
            tipo={t.tipo}
            disabled={disabled}
            onRemove={() => removeTag(t.id)}
          />
        ))}
        {item.tags.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Sin tags</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          className="h-8 w-[140px] bg-white text-xs"
          placeholder="Agregar tag"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addTag()
            }
          }}
        />
        <Select value={draftTipo} onValueChange={setDraftTipo}>
          <SelectTrigger className="h-8 w-[110px] bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DICT_TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 bg-white text-xs" disabled={disabled || !draft.trim()} onClick={addTag}>
          <Plus className="mr-1 h-3 w-3" />
          Tag
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={disabled} onClick={retag}>
          <Tags className="mr-1 h-3 w-3" />
          Reaplicar
        </Button>
      </div>
    </div>
  )
}

export default function FeedWebPage() {
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<string | null>(null)
  const [itemBusy, setItemBusy] = useState(false)
  const [dictBusy, setDictBusy] = useState(false)
  const [items, setItems] = useState<FeedWebItem[]>([])
  const [sources, setSources] = useState<FeedSource[]>([])
  const [tags, setTags] = useState<FeedWebTag[]>([])
  const [summary, setSummary] = useState<FeedWebSummary | null>(null)
  const [dictEntries, setDictEntries] = useState<FeedWebDictEntry[]>([])
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [tagFilter, setTagFilter] = useState<string>("all")
  const [dictTipoFilter, setDictTipoFilter] = useState<string>("all")
  const [newTexto, setNewTexto] = useState("")
  const [newAlias, setNewAlias] = useState("")
  const [newTipo, setNewTipo] = useState<string>("tema")
  const [metricWindow, setMetricWindow] = useState("7")
  const [metricScore, setMetricScore] = useState("count")
  const [minScore, setMinScore] = useState("2")
  const [minMunicipios, setMinMunicipios] = useState("2")
  const [publishing, setPublishing] = useState(false)
  const [lastPublish, setLastPublish] = useState<FeedWebAgendaPublishResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sourceId = sourceFilter === "all" ? undefined : Number(sourceFilter)
      const tag = tagFilter === "all" ? undefined : tagFilter
      const [itemsRes, sourcesRes, tagsRes, summaryRes, dictRes] = await Promise.all([
        listFeedWebItems({ source_id: sourceId, tag, limit: 80 }),
        listFeedWebSources(),
        listFeedWebTags(),
        getFeedWebSummary(),
        listFeedWebDictionary(),
      ])
      setItems(itemsRes)
      setSources(sourcesRes)
      setTags(tagsRes)
      setSummary(summaryRes)
      setDictEntries(dictRes)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar el feed web")
    } finally {
      setLoading(false)
    }
  }, [sourceFilter, tagFilter])

  useEffect(() => {
    load()
  }, [load])

  const filteredDict = useMemo(() => {
    if (dictTipoFilter === "all") return dictEntries
    return dictEntries.filter((e) => e.tipo === dictTipoFilter)
  }, [dictEntries, dictTipoFilter])

  const agendaPreview = useMemo(() => buildAgendaPreview(items), [items])
  const agendaMaxTema = useMemo(() => {
    let max = 1
    for (const row of agendaPreview) {
      for (const t of row.temas) max = Math.max(max, t.count)
    }
    return max
  }, [agendaPreview])

  const handleFetch = async () => {
    setFetching(true)
    setFetchProgress(null)
    try {
      const allSources = sources.length ? sources : await listFeedWebSources()
      if (!sources.length) setSources(allSources)
      const active = allSources.filter((s) => s.activa)
      if (active.length === 0) {
        toast.error("No hay fuentes activas")
        return
      }

      let inserted = 0
      let skippedUntagged = 0
      let failed = 0

      for (let i = 0; i < active.length; i++) {
        const src = active[i]
        setFetchProgress(`${i + 1}/${active.length} · ${src.nombre}`)
        try {
          const report = await fetchFeedWebSource(src.id)
          inserted += report.inserted || 0
          skippedUntagged += report.skipped_untagged || 0
          if (!report.ok) failed += 1
        } catch {
          failed += 1
        }
      }

      setFetchProgress("Retención…")
      const purge = await purgeFeedWebRetention().catch(() => ({ purged: 0 }))

      toast.success(
        `Actualizado: +${inserted} titulares` +
          (skippedUntagged ? ` · ${skippedUntagged} sin tags omitidos` : "") +
          (purge.purged ? ` · ${purge.purged} fuera de retención` : "") +
          (failed ? ` · ${failed} fuentes con error` : ""),
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar")
    } finally {
      setFetching(false)
      setFetchProgress(null)
    }
  }

  const handleDeleteItem = async (item: FeedWebItem) => {
    setItemBusy(true)
    try {
      await deleteFeedWebItem(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      toast.success("Titular eliminado")
      const summaryRes = await getFeedWebSummary().catch(() => null)
      if (summaryRes) setSummary(summaryRes)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    } finally {
      setItemBusy(false)
    }
  }

  const handleAddDict = async () => {
    if (!newTexto.trim() || !newAlias.trim()) return
    setDictBusy(true)
    try {
      const created = await createFeedWebDictEntry({
        texto: newTexto.trim(),
        alias: newAlias.trim(),
        tipo: newTipo,
        activa: true,
      })
      setDictEntries((prev) =>
        [...prev, created].sort((a, b) =>
          `${a.tipo}${a.texto}${a.alias}`.localeCompare(`${b.tipo}${b.texto}${b.alias}`),
        ),
      )
      setNewTexto("")
      setNewAlias("")
      toast.success("Entrada agregada al diccionario")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear")
    } finally {
      setDictBusy(false)
    }
  }

  const handlePublishAgenda = async () => {
    setPublishing(true)
    try {
      const result = await publishFeedWebAgenda({
        window_days: Number(metricWindow) || 7,
        score: metricScore === "recency" ? "recency" : "count",
        min_score: Number(minScore) || 2,
        min_municipios: Number(minMunicipios) || 2,
        require_variance: true,
      })
      setLastPublish(result)
      if (!result.ok) {
        toast.error(result.error || "Nada para publicar")
        return
      }
      toast.success(
        `Agenda: ${result.metricas.length} métricas · ${result.hechos} hechos` +
          (result.metricas_limpiadas ? ` · ${result.metricas_limpiadas} limpiadas` : ""),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo publicar")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <FeedShell
      live
      wide
      title="Feed web"
      description="Curación de titulares a la izquierda; corpus al centro; creador de métricas a la derecha."
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
            {fetching && fetchProgress ? fetchProgress : "Actualizar ahora"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.85fr)_minmax(300px,0.95fr)]">
        {/* Columna 1 — Titulares */}
        <Card className="border-border/80 bg-white shadow-sm xl:min-h-[70vh]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Titulares</CardTitle>
            <CardDescription>
              {loading
                ? "Cargando…"
                : `${items.length} mostrados · eliminar o recatalogar`}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-7 px-2 text-destructive"
                      disabled={itemBusy}
                      onClick={() => handleDeleteItem(item)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-snug hover:underline"
                  >
                    {item.titulo}
                  </a>
                  <ItemTagEditor
                    item={item}
                    busy={itemBusy}
                    onChange={(updated) => {
                      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
                    }}
                  />
                </article>
              ))}
          </CardContent>
        </Card>

        {/* Columna 2 — Resumen + Diccionario */}
        <div className="space-y-4">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen</CardTitle>
              <CardDescription>Corpus recolectado.</CardDescription>
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
                      <FeedTagChip
                        key={t.id}
                        texto={t.texto}
                        tipo={t.tipo}
                        count={t.count}
                        onClick={() => setTagFilter(t.texto)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Diccionario</CardTitle>
                  <CardDescription>Alias para clasificar al fetch / reaplicar.</CardDescription>
                </div>
                <Select value={dictTipoFilter} onValueChange={setDictTipoFilter}>
                  <SelectTrigger className="h-8 w-[110px] bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {DICT_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {filteredDict.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin entradas.</p>
                )}
                {filteredDict.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getFeedTagColor(entry.texto, entry.tipo) }}
                      title={entry.tipo}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {entry.texto}{" "}
                        <span className="font-normal text-muted-foreground">· {entry.tipo}</span>
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">{entry.alias}</p>
                    </div>
                    <Switch
                      checked={entry.activa}
                      disabled={dictBusy}
                      onCheckedChange={async (activa) => {
                        setDictBusy(true)
                        try {
                          const updated = await updateFeedWebDictEntry(entry.id, { activa })
                          setDictEntries((prev) =>
                            prev.map((e) => (e.id === entry.id ? updated : e)),
                          )
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Error")
                        } finally {
                          setDictBusy(false)
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={dictBusy}
                      onClick={async () => {
                        if (!confirm(`¿Eliminar «${entry.texto}» / ${entry.alias}?`)) return
                        setDictBusy(true)
                        try {
                          await deleteFeedWebDictEntry(entry.id)
                          setDictEntries((prev) => prev.filter((e) => e.id !== entry.id))
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Error")
                        } finally {
                          setDictBusy(false)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="grid gap-1.5 border-t border-border/60 pt-3">
                <Input
                  className="h-8 bg-white text-xs"
                  placeholder="Texto canónico (ej. La Matanza)"
                  value={newTexto}
                  onChange={(e) => setNewTexto(e.target.value)}
                />
                <Input
                  className="h-8 bg-white text-xs"
                  placeholder="Alias a buscar (ej. la matanza)"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                />
                <div className="flex gap-1.5">
                  <Select value={newTipo} onValueChange={setNewTipo}>
                    <SelectTrigger className="h-8 flex-1 bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DICT_TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 bg-white"
                    disabled={dictBusy || !newTexto.trim() || !newAlias.trim()}
                    onClick={handleAddDict}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80 bg-white shadow-sm xl:min-h-[70vh]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Creador de métricas</CardTitle>
            <CardDescription>
              Preset «Qué se está diciendo». Umbrales evitan métricas planas (rango 1–1) que no
              se ven en el mapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Qué se está diciendo</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Solo publica temas con variación real entre municipios. Una sola mención no alcanza.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Ventana</p>
                <Select value={metricWindow} onValueChange={setMetricWindow}>
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="14">Últimos 14 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Score</p>
                <Select value={metricScore} onValueChange={setMetricScore}>
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Ocurrencias</SelectItem>
                    <SelectItem value="recency">Peso por recencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Mín. menciones</p>
                <Select value={minScore} onValueChange={setMinScore}>
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">≥ 1 (todo)</SelectItem>
                    <SelectItem value="2">≥ 2</SelectItem>
                    <SelectItem value="3">≥ 3</SelectItem>
                    <SelectItem value="5">≥ 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Mín. municipios</p>
                <Select value={minMunicipios} onValueChange={setMinMunicipios}>
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">≥ 1</SelectItem>
                    <SelectItem value="2">≥ 2</SelectItem>
                    <SelectItem value="3">≥ 3</SelectItem>
                    <SelectItem value="5">≥ 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Preview linternitas
                {metricScore === "recency"
                  ? " · (preview = conteo; al publicar usa peso por recencia)"
                  : ""}
              </p>
              {agendaPreview.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                  Sin pares municipio × tema en los titulares cargados. Etiquetá o actualizá el feed.
                </p>
              ) : (
                <div className="max-h-[32vh] space-y-2.5 overflow-y-auto pr-1">
                  {agendaPreview.map((row) => (
                    <div
                      key={row.municipio}
                      className="rounded-md border border-border/60 px-2.5 py-2"
                    >
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium">{row.municipio}</p>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {row.total}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {row.temas.slice(0, 6).map((t) => (
                          <LinternaChip
                            key={t.texto}
                            texto={t.texto}
                            count={t.count}
                            max={agendaMaxTema}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border/60 pt-3">
              <Button
                className="w-full"
                disabled={publishing || loading}
                onClick={handlePublishAgenda}
              >
                {publishing ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Actualizar métricas en el mapa
              </Button>
              {lastPublish && (
                <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                  {lastPublish.ok ? (
                    <>
                      <p>
                        {lastPublish.metricas.length} métricas · {lastPublish.hechos} hechos ·
                        umbral ≥{lastPublish.min_score}/{lastPublish.min_municipios} mun.
                      </p>
                      {lastPublish.metricas.slice(0, 6).map((m) => (
                        <p key={m.clave} className="truncate">
                          {m.nombre_amigable}
                          {m.valor_min != null && m.valor_max != null
                            ? ` · ${m.valor_min}–${m.valor_max}`
                            : ""}
                          {m.is_active ? "" : " · borrador"}
                        </p>
                      ))}
                      {(lastPublish.skipped_temas?.length ?? 0) > 0 && (
                        <p className="mt-1 text-amber-800">
                          Omitidos: {lastPublish.skipped_temas!.slice(0, 3).map((s) => s.tema).join(", ")}
                          {lastPublish.skipped_temas!.length > 3 ? "…" : ""}
                        </p>
                      )}
                      {(lastPublish.skipped_low_score ?? 0) > 0 && (
                        <p className="text-amber-800">
                          {lastPublish.skipped_low_score} pares bajo mín. menciones
                        </p>
                      )}
                      {lastPublish.unresolved_municipios.length > 0 && (
                        <p className="text-amber-800">
                          Sin geo: {lastPublish.unresolved_municipios.slice(0, 5).join(", ")}
                          {lastPublish.unresolved_municipios.length > 5 ? "…" : ""}
                        </p>
                      )}
                      <p className="mt-1">
                        Activá en{" "}
                        <Link href="/metricas" className="underline underline-offset-2">
                          /metricas
                        </Link>
                        . Republicar limpia hechos viejos de temas que ya no califican.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>{lastPublish.error}</p>
                      {(lastPublish.skipped_temas?.length ?? 0) > 0 && (
                        <p className="mt-1">
                          {lastPublish.skipped_temas!.slice(0, 4).map((s) => (
                            <span key={s.tema} className="block">
                              {s.tema}: {s.reason}
                            </span>
                          ))}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Default ≥2 menciones y ≥2 municipios con variación. Bajá umbrales solo para
                probar; con corpus chico puede no publicar nada (mejor que pintar ruido).
              </p>
              <Button variant="outline" className="w-full bg-white" disabled>
                Crear métrica custom…
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </FeedShell>
  )
}
