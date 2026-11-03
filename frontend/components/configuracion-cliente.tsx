"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { MapModeSwitcher } from "@/components/map-mode-switcher"
import {
  createFeedWebSource,
  deleteFeedWebSource,
  getWorkspaceConfig,
  listFeedWebSources,
  patchWorkspaceConfig,
  seedFeedWebLocalSources,
  seedFeedWebProvincialSources,
  updateFeedWebSource,
  type FeedSource,
} from "@/lib/api"

const TABS = [
  { id: "mapa", label: "Mapa", status: "live" as const },
  { id: "analisis", label: "Análisis", status: "preview" as const },
  { id: "feeds", label: "Feeds", status: "live" as const },
  { id: "social", label: "Social", status: "preview" as const },
  { id: "web", label: "Web", status: "live" as const },
  { id: "ia", label: "IA", status: "preview" as const },
  { id: "archivos", label: "Archivos", status: "preview" as const },
  { id: "metricas", label: "Métricas", status: "delegated" as const },
] as const

type SocioFeedDraft = {
  borrar_trimestre_anterior_al_publicar: boolean
  trimestre_referencia: string | null
}

function StatusBadge({ status }: { status: "live" | "preview" | "delegated" }) {
  if (status === "live") {
    return (
      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15">
        Persistido
      </Badge>
    )
  }
  if (status === "delegated") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        En su pantalla
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15">
      Próximamente
    </Badge>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function DelegatedLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-emerald-300/60 bg-emerald-50/50 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button variant="link" className="h-auto p-0 mt-1" asChild>
        <Link href={href}>
          Gestionar en {href}
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  )
}

function readSocio(doc: Record<string, unknown>): SocioFeedDraft {
  const feeds = (doc.feeds as Record<string, unknown> | undefined) ?? {}
  const socio = (feeds.socio as Record<string, unknown> | undefined) ?? {}
  return {
    borrar_trimestre_anterior_al_publicar: Boolean(socio.borrar_trimestre_anterior_al_publicar),
    trimestre_referencia: (socio.trimestre_referencia as string | null | undefined) ?? null,
  }
}

export function ConfiguracionCliente() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [livePaths, setLivePaths] = useState<string[]>([])
  const [socio, setSocio] = useState<SocioFeedDraft>({
    borrar_trimestre_anterior_al_publicar: false,
    trimestre_referencia: null,
  })
  const [mapStyle, setMapStyle] = useState("osm")
  const [mapModo, setMapModo] = useState<"pba" | "nacional">("pba")
  const [intensityMode, setIntensityMode] = useState("relative")
  const [showPanel, setShowPanel] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [highlightThreshold, setHighlightThreshold] = useState([35])
  const [socialPolling, setSocialPolling] = useState("15")
  const [webPolling, setWebPolling] = useState("30")
  const [webRetention, setWebRetention] = useState("30")
  const [webClassify, setWebClassify] = useState(true)
  const [webImportUntagged, setWebImportUntagged] = useState(false)
  const [webSources, setWebSources] = useState<FeedSource[]>([])
  const [newSourceName, setNewSourceName] = useState("")
  const [newSourceUrl, setNewSourceUrl] = useState("")
  const [newSourceMuni, setNewSourceMuni] = useState("")
  const [newSourceProv, setNewSourceProv] = useState("")
  const [sourcesBusy, setSourcesBusy] = useState(false)
  const [iaConfidence, setIaConfidence] = useState([75])
  const [iaDailyLimit, setIaDailyLimit] = useState("50")
  const [autoProcessor, setAutoProcessor] = useState(true)
  const [uploadPreview, setUploadPreview] = useState(true)
  const [maxSecondaries, setMaxSecondaries] = useState("4")
  const [xConnected, setXConnected] = useState(false)
  const [metaConnected, setMetaConnected] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, sources] = await Promise.all([getWorkspaceConfig(), listFeedWebSources().catch(() => [])])
      const doc = res.document as Record<string, unknown>
      setLivePaths(res.live_paths)
      setSocio(readSocio(doc))
      setWebSources(sources)
      const defaults = (doc.defaults as Record<string, unknown> | undefined) ?? {}
      const mapa = (defaults.mapa as Record<string, unknown> | undefined) ?? {}
      const analisis = (defaults.analisis as Record<string, unknown> | undefined) ?? {}
      const metricas = (defaults.metricas as Record<string, unknown> | undefined) ?? {}
      const feeds = (doc.feeds as Record<string, unknown> | undefined) ?? {}
      const web = (feeds.web as Record<string, unknown> | undefined) ?? {}
      const social = (feeds.social as Record<string, unknown> | undefined) ?? {}
      const ia = (feeds.ia as Record<string, unknown> | undefined) ?? {}
      const archivos = (doc.archivos as Record<string, unknown> | undefined) ?? {}
      if (typeof mapa.map_style === "string") setMapStyle(mapa.map_style)
      if (mapa.modo === "pba" || mapa.modo === "nacional") setMapModo(mapa.modo)
      if (typeof mapa.intensity_mode === "string") setIntensityMode(mapa.intensity_mode)
      if (typeof mapa.show_panel === "boolean") setShowPanel(mapa.show_panel)
      if (typeof mapa.show_legend === "boolean") setShowLegend(mapa.show_legend)
      if (typeof analisis.highlight_threshold_pct === "number") {
        setHighlightThreshold([analisis.highlight_threshold_pct])
      }
      if (typeof social.ingest_interval_min === "number") setSocialPolling(String(social.ingest_interval_min))
      if (typeof web.fetch_interval_min === "number") setWebPolling(String(web.fetch_interval_min))
      if (typeof web.retention_days === "number") setWebRetention(String(web.retention_days))
      if (typeof web.classify_territorial === "boolean") setWebClassify(web.classify_territorial)
      if (typeof web.import_untagged === "boolean") setWebImportUntagged(web.import_untagged)
      if (typeof ia.min_confidence_pct === "number") setIaConfidence([ia.min_confidence_pct])
      if (typeof ia.daily_limit === "number") setIaDailyLimit(String(ia.daily_limit))
      if (typeof archivos.auto_suggest_processor === "boolean") setAutoProcessor(archivos.auto_suggest_processor)
      if (typeof archivos.preview_before_process === "boolean") setUploadPreview(archivos.preview_before_process)
      if (typeof metricas.max_secondaries === "number") setMaxSecondaries(String(metricas.max_secondaries))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar configuración")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      await patchWorkspaceConfig({
        defaults: {
          mapa: {
            modo: mapModo,
          },
        },
        feeds: {
          socio: {
            borrar_trimestre_anterior_al_publicar: socio.borrar_trimestre_anterior_al_publicar,
          },
          web: {
            fetch_interval_min: Number(webPolling) || 30,
            retention_days: Number(webRetention) || 30,
            classify_territorial: webClassify,
            import_untagged: webImportUntagged,
          },
        },
      })
      toast.success("Configuración guardada en workspace_config")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    await load()
    toast.info("Valores recargados desde el servidor")
  }

  const pbaSources = useMemo(
    () => webSources.filter((s) => Boolean(s.municipio_default)),
    [webSources],
  )
  const nacionalSources = useMemo(
    () => webSources.filter((s) => Boolean(s.provincia_default) || !s.municipio_default),
    [webSources],
  )

  const renderSourceRow = (src: FeedSource) => (
    <div
      key={src.id}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{src.nombre}</p>
        <p className="truncate text-[11px] text-muted-foreground">{src.url}</p>
        {src.municipio_default && (
          <p className="text-[11px] text-emerald-800">Municipio default: {src.municipio_default}</p>
        )}
        {src.provincia_default && (
          <p className="text-[11px] text-sky-800">Provincia default: {src.provincia_default}</p>
        )}
        {src.ultimo_error && (
          <p className="text-[11px] text-destructive">{src.ultimo_error}</p>
        )}
      </div>
      <Switch
        checked={src.activa}
        disabled={sourcesBusy}
        onCheckedChange={async (activa) => {
          setSourcesBusy(true)
          try {
            await updateFeedWebSource(src.id, { activa })
            setWebSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, activa } : s)))
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error")
          } finally {
            setSourcesBusy(false)
          }
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        disabled={sourcesBusy}
        onClick={async () => {
          if (!confirm(`¿Eliminar fuente «${src.nombre}»?`)) return
          setSourcesBusy(true)
          try {
            await deleteFeedWebSource(src.id)
            setWebSources((prev) => prev.filter((s) => s.id !== src.id))
            toast.success("Fuente eliminada")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error")
          } finally {
            setSourcesBusy(false)
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Configuración</h1>
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15">
                Hub workspace
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Un solo documento JSON (<code className="text-xs">workspace_config</code>). Lo Persistido ya se guarda; el
              resto es preview con el mismo schema listo para cablear.
            </p>
            {livePaths.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Paths activos: {livePaths.join(", ")}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white hover:bg-white"
              onClick={handleReset}
              disabled={loading || saving}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Recargar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando workspace_config…
            </div>
          ) : (
            <Tabs defaultValue="feeds">
              <TabsList className="mb-4 flex h-auto flex-wrap gap-1 bg-white/80 p-1">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                    {tab.label}
                    <StatusBadge status={tab.status} />
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="feeds">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Feeds</CardTitle>
                      <StatusBadge status="live" />
                    </div>
                    <CardDescription>
                      Políticas de conectores. EPH ya persiste. Operación diaria también en{" "}
                      <Link href="/feeds/apis" className="text-primary underline-offset-2 hover:underline">
                        Feed APIs
                      </Link>
                      .
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4 rounded-lg border border-border/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">Socioeconómico (EPH)</h3>
                        <StatusBadge status="live" />
                      </div>
                      <SwitchRow
                        label="Borrar trimestre anterior al publicar"
                        hint="Evita mezclar hechos de trimestres previos en el mapa."
                        checked={socio.borrar_trimestre_anterior_al_publicar}
                        onCheckedChange={(v) =>
                          setSocio((s) => ({ ...s, borrar_trimestre_anterior_al_publicar: v }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Trimestre de referencia:{" "}
                        <span className="font-medium text-foreground">
                          {socio.trimestre_referencia ?? "— (aún no hay ingest)"}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-2 rounded-lg border border-dashed border-amber-300/50 bg-amber-50/40 p-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Web / Social / IA</h3>
                        <StatusBadge status="preview" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Schema listo en <code className="text-[11px]">document.feeds.*</code>. Al implementar cada
                        conector se cablea sin nueva tabla de config.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="mapa">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Mapa</CardTitle>
                      <StatusBadge status="live" />
                    </div>
                    <CardDescription>
                      Defaults al abrir el dashboard. Destino: <code className="text-xs">defaults.mapa</code>.
                      El modo de alcance ya afecta la capa del mapa.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Field
                      label="Alcance del mapa"
                      hint="Define la capa base del dashboard y qué métricas aparecen en los filtros."
                    >
                      <MapModeSwitcher value={mapModo} onChange={setMapModo} />
                    </Field>
                    <Field label="Estilo de mapa base">
                      <Select value={mapStyle} onValueChange={setMapStyle}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="osm">OpenStreetMap</SelectItem>
                          <SelectItem value="satellite">Satélite</SelectItem>
                          <SelectItem value="terrain">Terreno</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Modo de color por partido">
                      <Select value={intensityMode} onValueChange={setIntensityMode}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relative">Intensidad relativa (p5–p95)</SelectItem>
                          <SelectItem value="absolute">Absoluta</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <SwitchRow label="Mostrar panel lateral" checked={showPanel} onCheckedChange={setShowPanel} />
                    <SwitchRow label="Mostrar leyenda" checked={showLegend} onCheckedChange={setShowLegend} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analisis">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Análisis</CardTitle>
                      <StatusBadge status="preview" />
                    </div>
                    <CardDescription>
                      Destino: <code className="text-xs">defaults.analisis</code>.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Field label="Umbral de resaltado (%)">
                      <div className="flex items-center gap-4">
                        <Slider
                          value={highlightThreshold}
                          onValueChange={setHighlightThreshold}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1"
                        />
                        <span className="w-10 text-sm font-medium tabular-nums">{highlightThreshold[0]}%</span>
                      </div>
                    </Field>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="social">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Social</CardTitle>
                      <StatusBadge status="preview" />
                    </div>
                    <CardDescription>
                      Políticas en <code className="text-xs">feeds.social</code>; OAuth = secrets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <SwitchRow label="Cuenta X conectada (mock)" checked={xConnected} onCheckedChange={setXConnected} />
                    <SwitchRow
                      label="Meta conectada (mock)"
                      checked={metaConnected}
                      onCheckedChange={setMetaConnected}
                    />
                    <Field label="Intervalo de ingesta">
                      <Select value={socialPolling} onValueChange={setSocialPolling}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">Cada 15 minutos</SelectItem>
                          <SelectItem value="30">Cada 30 minutos</SelectItem>
                          <SelectItem value="60">Cada hora</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="web">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Web / medios</CardTitle>
                      <StatusBadge status="live" />
                    </div>
                    <CardDescription>
                      Políticas en <code className="text-xs">feeds.web</code>. Fuentes RSS en tabla{" "}
                      <code className="text-xs">feed_sources</code>. Ver titulares en{" "}
                      <Link href="/feeds/web" className="underline underline-offset-2">
                        /feeds/web
                      </Link>
                      .
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Intervalo de fetch deseado"
                        hint="Referencia para un cron futuro; el PoC usa «Actualizar ahora»."
                      >
                        <Select value={webPolling} onValueChange={setWebPolling}>
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">Cada 15 minutos</SelectItem>
                            <SelectItem value="30">Cada 30 minutos</SelectItem>
                            <SelectItem value="60">Cada hora</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Retención (días)" hint="Al actualizar se borran ítems más viejos.">
                        <Input
                          className="bg-white"
                          type="number"
                          min={1}
                          value={webRetention}
                          onChange={(e) => setWebRetention(e.target.value)}
                        />
                      </Field>
                    </div>
                    <SwitchRow
                      label="Clasificación por diccionario"
                      hint="Asigna tags de municipio / partido / tema al bajar titulares."
                      checked={webClassify}
                      onCheckedChange={setWebClassify}
                    />
                    <SwitchRow
                      label="Importar titulares sin tags"
                      hint="Si está apagado (recomendado), al actualizar se omiten notas sin match de diccionario (salud, internacionales, etc.)."
                      checked={webImportUntagged}
                      onCheckedChange={setWebImportUntagged}
                    />

                    <div className="space-y-3">
                      <div>
                        <Label>Fuentes RSS</Label>
                        <p className="text-xs text-muted-foreground">
                          PBA: medios con municipio default. Nacional: provinciales (provincia
                          default) y portales sin municipio (match por texto).
                        </p>
                      </div>

                      <Tabs defaultValue="pba" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/60">
                          <TabsTrigger value="pba">PBA · municipios ({pbaSources.length})</TabsTrigger>
                          <TabsTrigger value="nacional">
                            Nacional · provincias ({nacionalSources.length})
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="pba" className="mt-3 space-y-3">
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-white"
                              disabled={sourcesBusy}
                              onClick={async () => {
                                setSourcesBusy(true)
                                try {
                                  const res = await seedFeedWebLocalSources()
                                  toast.success(
                                    `PBA: +${res.created} nuevas · ${res.updated} actualizadas (${res.total_file} en archivo)`,
                                  )
                                  setWebSources(await listFeedWebSources())
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Error al importar")
                                } finally {
                                  setSourcesBusy(false)
                                }
                              }}
                            >
                              Importar medios locales (RSS OK)
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {pbaSources.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No hay fuentes PBA. Importá locales o agregá con municipio.
                              </p>
                            ) : (
                              pbaSources.map(renderSourceRow)
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_0.8fr_auto]">
                            <Input
                              className="bg-white"
                              placeholder="Nombre del medio"
                              value={newSourceName}
                              onChange={(e) => setNewSourceName(e.target.value)}
                            />
                            <Input
                              className="bg-white"
                              placeholder="URL del RSS"
                              value={newSourceUrl}
                              onChange={(e) => setNewSourceUrl(e.target.value)}
                            />
                            <Input
                              className="bg-white"
                              placeholder="Municipio"
                              value={newSourceMuni}
                              onChange={(e) => setNewSourceMuni(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              className="bg-white"
                              disabled={
                                sourcesBusy || !newSourceName.trim() || !newSourceUrl.trim()
                              }
                              onClick={async () => {
                                setSourcesBusy(true)
                                try {
                                  const created = await createFeedWebSource({
                                    nombre: newSourceName.trim(),
                                    url: newSourceUrl.trim(),
                                    activa: true,
                                    municipio_default: newSourceMuni.trim() || null,
                                    provincia_default: null,
                                  })
                                  setWebSources((prev) =>
                                    [...prev, created].sort((a, b) =>
                                      a.nombre.localeCompare(b.nombre),
                                    ),
                                  )
                                  setNewSourceName("")
                                  setNewSourceUrl("")
                                  setNewSourceMuni("")
                                  toast.success("Fuente PBA agregada")
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Error")
                                } finally {
                                  setSourcesBusy(false)
                                }
                              }}
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              Agregar
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="nacional" className="mt-3 space-y-3">
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-white"
                              disabled={sourcesBusy}
                              onClick={async () => {
                                setSourcesBusy(true)
                                try {
                                  const res = await seedFeedWebProvincialSources()
                                  toast.success(
                                    `Provinciales: +${res.created} nuevas · ${res.updated} actualizadas (${res.total_file} en archivo)`,
                                  )
                                  setWebSources(await listFeedWebSources())
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Error al importar")
                                } finally {
                                  setSourcesBusy(false)
                                }
                              }}
                            >
                              Importar medios provinciales (CSV)
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {nacionalSources.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No hay fuentes nacionales. Importá provinciales o agregá con
                                provincia.
                              </p>
                            ) : (
                              nacionalSources.map(renderSourceRow)
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_0.8fr_auto]">
                            <Input
                              className="bg-white"
                              placeholder="Nombre del medio"
                              value={newSourceName}
                              onChange={(e) => setNewSourceName(e.target.value)}
                            />
                            <Input
                              className="bg-white"
                              placeholder="URL del RSS"
                              value={newSourceUrl}
                              onChange={(e) => setNewSourceUrl(e.target.value)}
                            />
                            <Input
                              className="bg-white"
                              placeholder="Provincia (opcional)"
                              value={newSourceProv}
                              onChange={(e) => setNewSourceProv(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              className="bg-white"
                              disabled={
                                sourcesBusy || !newSourceName.trim() || !newSourceUrl.trim()
                              }
                              onClick={async () => {
                                setSourcesBusy(true)
                                try {
                                  const created = await createFeedWebSource({
                                    nombre: newSourceName.trim(),
                                    url: newSourceUrl.trim(),
                                    activa: true,
                                    municipio_default: null,
                                    provincia_default: newSourceProv.trim() || null,
                                  })
                                  setWebSources((prev) =>
                                    [...prev, created].sort((a, b) =>
                                      a.nombre.localeCompare(b.nombre),
                                    ),
                                  )
                                  setNewSourceName("")
                                  setNewSourceUrl("")
                                  setNewSourceProv("")
                                  toast.success("Fuente nacional agregada")
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Error")
                                } finally {
                                  setSourcesBusy(false)
                                }
                              }}
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              Agregar
                            </Button>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ia">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>IA</CardTitle>
                      <StatusBadge status="preview" />
                    </div>
                    <CardDescription>
                      Políticas en <code className="text-xs">feeds.ia</code>; API keys en env.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Field label="Confianza mínima (%)">
                      <div className="flex items-center gap-4">
                        <Slider
                          value={iaConfidence}
                          onValueChange={setIaConfidence}
                          min={50}
                          max={95}
                          step={5}
                          className="flex-1"
                        />
                        <span className="w-10 text-sm font-medium tabular-nums">{iaConfidence[0]}%</span>
                      </div>
                    </Field>
                    <Field label="Límite diario">
                      <Input
                        className="w-32 bg-white"
                        type="number"
                        value={iaDailyLimit}
                        onChange={(e) => setIaDailyLimit(e.target.value)}
                      />
                    </Field>
                    <Field label="Métricas elegibles (mock)">
                      <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                        {["Electoral", "Económica (PBG)", "Demográfica"].map((name) => (
                          <label key={name} className="flex items-center gap-2 text-sm">
                            <Checkbox defaultChecked />
                            {name}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="archivos">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Archivos</CardTitle>
                      <StatusBadge status="preview" />
                    </div>
                    <CardDescription>
                      Destino: <code className="text-xs">archivos.*</code>.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <SwitchRow
                      label="Sugerir procesador al subir"
                      checked={autoProcessor}
                      onCheckedChange={setAutoProcessor}
                    />
                    <SwitchRow
                      label="Preview antes de procesar"
                      checked={uploadPreview}
                      onCheckedChange={setUploadPreview}
                    />
                    <DelegatedLink
                      href="/archivos"
                      label="La definición de procesadores se gestiona en Archivos."
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="metricas">
                <Card className="border-border/80 bg-white shadow-sm">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Métricas</CardTitle>
                      <StatusBadge status="delegated" />
                    </div>
                    <CardDescription>
                      Por indicador → tabla metricas. Políticas de equipo → defaults.metricas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <DelegatedLink
                      href="/metricas"
                      label="Activación y escala del slider se configuran en Gestión de Métricas."
                    />
                    <Field label="Máximo de secundarias (preview)">
                      <Select value={maxSecondaries} onValueChange={setMaxSecondaries}>
                        <SelectTrigger className="w-40 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  )
}
