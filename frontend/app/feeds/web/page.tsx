"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Plus, RefreshCw, Tags, Trash2, X } from "lucide-react"
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
  fetchFeedWebNow,
  getFeedWebSummary,
  listFeedWebDictionary,
  listFeedWebItems,
  listFeedWebSources,
  listFeedWebTags,
  retagFeedWebItem,
  setFeedWebItemTags,
  updateFeedWebDictEntry,
  type FeedSource,
  type FeedWebDictEntry,
  type FeedWebItem,
  type FeedWebSummary,
  type FeedWebTag,
} from "@/lib/api"

const DICT_TIPOS = ["municipio", "partido", "tema", "otro"] as const

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
          <Badge key={t.id} variant="secondary" className="gap-1 pr-1 text-[10px]">
            <span>
              {t.texto}
              {t.tipo ? ` · ${t.tipo}` : ""}
            </span>
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-muted"
              disabled={disabled}
              onClick={() => removeTag(t.id)}
              aria-label={`Quitar ${t.texto}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
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

  const handleDeleteItem = async (item: FeedWebItem) => {
    if (!confirm(`¿Eliminar titular «${item.titulo.slice(0, 80)}»?`)) return
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

  return (
    <FeedShell
      live
      title="Feed web"
      description="Titulares RSS con curación: diccionario en tabla, edición manual de tags y descarte de irrelevantes."
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
                : `${items.length} mostrados · eliminar o recatalogar cada uno`}
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

          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Diccionario</CardTitle>
                  <CardDescription>
                    Alias activos para clasificar al fetch / reaplicar. No vive en Configuración.
                  </CardDescription>
                </div>
                <Select value={dictTipoFilter} onValueChange={setDictTipoFilter}>
                  <SelectTrigger className="h-8 w-[130px] bg-white text-xs">
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
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {filteredDict.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin entradas.</p>
                )}
                {filteredDict.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
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

          <Card className="border-dashed border-primary/25 bg-white/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Métricas (próxima fase)</CardTitle>
              <CardDescription>
                Todavía no se publica nada al mapa ni al catálogo de métricas.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Fuentes y políticas en{" "}
              <Link href="/configuracion" className="underline underline-offset-2">
                Configuración → Web
              </Link>
              . Diccionario y curación de titulares, acá.
            </CardContent>
          </Card>
        </div>
      </div>
    </FeedShell>
  )
}
