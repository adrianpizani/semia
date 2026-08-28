"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, RotateCcw, Save } from "lucide-react"
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

const TABS = [
  { id: "mapa", label: "Mapa" },
  { id: "analisis", label: "Análisis" },
  { id: "social", label: "Social" },
  { id: "web", label: "Web" },
  { id: "ia", label: "IA" },
  { id: "archivos", label: "Archivos" },
  { id: "metricas", label: "Métricas" },
] as const

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

export function ConfiguracionCliente() {
  const [mapStyle, setMapStyle] = useState("osm")
  const [intensityMode, setIntensityMode] = useState("relative")
  const [showPanel, setShowPanel] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [highlightThreshold, setHighlightThreshold] = useState([35])
  const [socialPolling, setSocialPolling] = useState("15")
  const [webPolling, setWebPolling] = useState("30")
  const [webRetention, setWebRetention] = useState("30")
  const [iaConfidence, setIaConfidence] = useState([75])
  const [iaDailyLimit, setIaDailyLimit] = useState("50")
  const [autoProcessor, setAutoProcessor] = useState(true)
  const [uploadPreview, setUploadPreview] = useState(true)
  const [maxSecondaries, setMaxSecondaries] = useState("4")
  const [xConnected, setXConnected] = useState(false)
  const [metaConnected, setMetaConnected] = useState(false)

  const handleSave = () => toast.success("Configuración guardada (vista previa — sin persistencia)")
  const handleReset = () => toast.info("Valores restablecidos (vista previa)")

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Configuración</h1>
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15">
                Vista previa
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Preferencias por pantalla del workspace. El plan detallado está en CONFIG.md.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="bg-white hover:bg-white" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restablecer
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-5xl">
          <Tabs defaultValue="mapa" className="w-full">
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-white p-1">
              {TABS.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Mapa */}
            <TabsContent value="mapa">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Mapa</CardTitle>
                  <CardDescription>Defaults al abrir el dashboard electoral.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Field label="Métrica primaria por defecto" hint="Métrica electoral preseleccionada.">
                    <Select defaultValue="diputados-2023">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diputados-2023">Diputados 2023</SelectItem>
                        <SelectItem value="presidente-2023">Presidente 2023</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Métricas secundarias iniciales" hint="Indicadores precargados en la barra de filtros.">
                    <Select defaultValue="pbg">
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Elegir..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pbg">PBG · Población</SelectItem>
                        <SelectItem value="pobreza">Índice de pobreza</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Partido por defecto">
                      <Select defaultValue="lla">
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lla">La Libertad Avanza</SelectItem>
                          <SelectItem value="uxp">Unión por la Patria</SelectItem>
                          <SelectItem value="jxc">Juntos por el Cambio</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Año">
                      <Select defaultValue="2023">
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2023">2023</SelectItem>
                          <SelectItem value="2021">2021</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Tipo de voto">
                      <Select defaultValue="positivo">
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positivo">Positivo</SelectItem>
                          <SelectItem value="todos">Todos</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Estilo de mapa base">
                      <Select value={mapStyle} onValueChange={setMapStyle}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="osm">OpenStreetMap</SelectItem>
                          <SelectItem value="satellite">Satélite</SelectItem>
                          <SelectItem value="terrain">Terreno</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Color por partido">
                      <Select value={intensityMode} onValueChange={setIntensityMode}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relative">Intensidad relativa (p5–p95)</SelectItem>
                          <SelectItem value="absolute">Intensidad absoluta</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <SwitchRow label="Mostrar panel lateral" hint="Detalle del municipio seleccionado." checked={showPanel} onCheckedChange={setShowPanel} />
                  <SwitchRow label="Mostrar leyenda de partidos" checked={showLegend} onCheckedChange={setShowLegend} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Análisis */}
            <TabsContent value="analisis">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Análisis</CardTitle>
                  <CardDescription>Tabla territorial y cruce scatter.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Field label="Columnas visibles por defecto">
                    <Select defaultValue="pbg-poblacion">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pbg-poblacion">PBG + Población</SelectItem>
                        <SelectItem value="ninguna">Ninguna (elegir manualmente)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Orden inicial de filas">
                    <Select defaultValue="share-desc">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="share-desc">% partido (mayor a menor)</SelectItem>
                        <SelectItem value="nombre-asc">Nombre (A–Z)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Métrica X del cruce por defecto">
                    <Select defaultValue="pbg">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pbg">PBG</SelectItem>
                        <SelectItem value="poblacion">Población</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Umbral de resaltado (%)" hint="Mínimo para tintar filas con partido elegido.">
                    <div className="flex items-center gap-4">
                      <Slider value={highlightThreshold} onValueChange={setHighlightThreshold} min={0} max={100} step={5} className="flex-1" />
                      <span className="w-10 text-sm font-medium tabular-nums">{highlightThreshold[0]}%</span>
                    </div>
                  </Field>
                  <Field label="Formato de exportación">
                    <Select defaultValue="xlsx">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social */}
            <TabsContent value="social">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Social</CardTitle>
                  <CardDescription>Menciones en X e Instagram / Facebook.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Cuenta X</p>
                        <p className="text-xs text-muted-foreground">{xConnected ? "Conectada" : "Sin conectar"}</p>
                      </div>
                      <Button variant={xConnected ? "outline" : "default"} size="sm" onClick={() => setXConnected(v => !v)}>
                        {xConnected ? "Desconectar" : "Conectar"}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Instagram / Facebook</p>
                        <p className="text-xs text-muted-foreground">{metaConnected ? "Conectada" : "Sin conectar"}</p>
                      </div>
                      <Button variant={metaConnected ? "outline" : "default"} size="sm" onClick={() => setMetaConnected(v => !v)}>
                        {metaConnected ? "Desconectar" : "Conectar"}
                      </Button>
                    </div>
                  </div>
                  <Field label="Keywords y hashtags" hint="Un término por línea.">
                    <Textarea className="bg-white font-mono text-sm" rows={4} defaultValue={"#PBA\nLa Libertad Avanza\nAxel Kicillof\nLa Matanza"} />
                  </Field>
                  <Field label="Intervalo de ingesta">
                    <Select value={socialPolling} onValueChange={setSocialPolling}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">Cada 5 minutos</SelectItem>
                        <SelectItem value="15">Cada 15 minutos</SelectItem>
                        <SelectItem value="30">Cada 30 minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Publicación de métricas generadas">
                    <Select defaultValue="borrador">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="borrador">Siempre como borrador</SelectItem>
                        <SelectItem value="auto">Auto-activar tras revisión</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Web */}
            <TabsContent value="web">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Web</CardTitle>
                  <CardDescription>Titulares vía RSS y Google News.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Field label="Fuentes RSS" hint="Una URL por línea.">
                    <Textarea
                      className="bg-white font-mono text-xs"
                      rows={5}
                      defaultValue={
                        "https://www.clarin.com/rss/politica/\nhttps://www.lanacion.com.ar/arc/outboundfeeds/rss/category/politica/?outputType=xml\nhttps://provincialnews.com.ar/feed/"
                      }
                    />
                  </Field>
                  <Field label="Queries Google News" hint="Para medios sin feed propio.">
                    <Textarea
                      className="bg-white font-mono text-xs"
                      rows={3}
                      defaultValue={"Buenos Aires provincia politica\nsite:provincianoticias.com.ar"}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Intervalo de fetch">
                      <Select value={webPolling} onValueChange={setWebPolling}>
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">Cada 15 minutos</SelectItem>
                          <SelectItem value="30">Cada 30 minutos</SelectItem>
                          <SelectItem value="60">Cada hora</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Retención de noticias (días)">
                      <Input className="bg-white" type="number" value={webRetention} onChange={e => setWebRetention(e.target.value)} />
                    </Field>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* IA */}
            <TabsContent value="ia">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>IA</CardTitle>
                  <CardDescription>Sugerencias y métricas derivadas sobre datos cargados.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Modelo">
                      <Select defaultValue="gpt-4o-mini">
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                          <SelectItem value="claude-sonnet">Claude Sonnet</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Temperatura">
                      <Select defaultValue="0.3">
                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.1">Baja (0.1)</SelectItem>
                          <SelectItem value="0.3">Media (0.3)</SelectItem>
                          <SelectItem value="0.7">Alta (0.7)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Confianza mínima (%)" hint="Solo mostrar insights por encima de este umbral.">
                    <div className="flex items-center gap-4">
                      <Slider value={iaConfidence} onValueChange={setIaConfidence} min={50} max={95} step={5} className="flex-1" />
                      <span className="w-10 text-sm font-medium tabular-nums">{iaConfidence[0]}%</span>
                    </div>
                  </Field>
                  <Field label="Métricas elegibles para derivar">
                    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                      {["Electoral", "Económica (PBG)", "Demográfica"].map(name => (
                        <label key={name} className="flex items-center gap-2 text-sm">
                          <Checkbox defaultChecked />
                          {name}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Flujo de publicación">
                    <Select defaultValue="borrador">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="borrador">Borrador obligatorio</SelectItem>
                        <SelectItem value="directo">Permitir activación directa</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Límite diario de sugerencias">
                    <Input className="bg-white w-32" type="number" value={iaDailyLimit} onChange={e => setIaDailyLimit(e.target.value)} />
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Archivos */}
            <TabsContent value="archivos">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Archivos</CardTitle>
                  <CardDescription>Upload y procesamiento de datasets.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <SwitchRow label="Sugerir procesador al subir" hint="Match automático por columnas del CSV." checked={autoProcessor} onCheckedChange={setAutoProcessor} />
                  <SwitchRow label="Preview antes de procesar" hint="Validar columnas y geografía." checked={uploadPreview} onCheckedChange={setUploadPreview} />
                  <Field label="Retención de archivos fallidos (días)">
                    <Input className="bg-white w-32" type="number" defaultValue={30} />
                  </Field>
                  <DelegatedLink href="/archivos" label="La definición de procesadores (mapeo columnas → métricas) se gestiona en Archivos." />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Métricas */}
            <TabsContent value="metricas">
              <Card className="border-border/80 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Métricas</CardTitle>
                  <CardDescription>Catálogo activo y visibilidad en mapa / análisis.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <DelegatedLink href="/metricas" label="Activación de métricas y escala del slider (lineal / log) ya se configuran en Gestión de Métricas." />
                  <Field label="Máximo de secundarias en el mapa">
                    <Select value={maxSecondaries} onValueChange={setMaxSecondaries}>
                      <SelectTrigger className="bg-white w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Métricas generadas por feeds">
                    <Select defaultValue="borrador">
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="borrador">Siempre borrador</SelectItem>
                        <SelectItem value="auto">Auto-activar</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Homologaciones de partido" hint="Aliases entre fuentes. Formato: alias → nombre canónico.">
                    <Textarea className="bg-white font-mono text-xs" rows={4} defaultValue={"LLA → La Libertad Avanza\nUxP → Unión por la Patria\nPRO → Propuesta Republicana"} />
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
