"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Upload, FileSpreadsheet, Rocket, RefreshCw, AlertCircle, X, CloudDownload } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  FeedSocioConfig,
  FeedSocioIngestResult,
  FeedSocioPreview,
  FeedSocioPublishResult,
  FeedSocioStagingRow,
  getFeedSocioConfig,
  getFeedSocioPreview,
  getFeedSocioStaging,
  downloadFeedSocioLatest,
  ingestFeedSocioSample,
  publishFeedSocio,
  updateFeedSocioConfig,
  uploadFeedSocioEphTrimestre,
} from "@/lib/api"

export function FeedsApisCliente() {
  const [staging, setStaging] = useState<FeedSocioStagingRow[]>([])
  const [preview, setPreview] = useState<FeedSocioPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [hogarFile, setHogarFile] = useState<File | null>(null)
  const [individualFile, setIndividualFile] = useState<File | null>(null)
  const [feedConfig, setFeedConfig] = useState<FeedSocioConfig | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, prev, cfg] = await Promise.all([
        getFeedSocioStaging(),
        getFeedSocioPreview(),
        getFeedSocioConfig(),
      ])
      setStaging(rows)
      setPreview(prev)
      setFeedConfig(cfg)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar datos"
      setLastError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runAction = async (key: string, fn: () => Promise<FeedSocioIngestResult | FeedSocioPublishResult>) => {
    setBusy(key)
    try {
      const result = await fn()
      setLastError(null)
      if ("inserted" in result) {
        const indicadores = result.indicadores?.join(", ") ?? ""
        const origen = result.source ? ` (${result.source})` : ""
        toast.success(
          `${result.periodo ?? "Trimestre"}${origen}: ${result.inserted} filas staging (${indicadores})`,
        )
      } else {
        const pub = result.publicados?.length ? result.publicados.join(", ") : result.metrica_clave
        const elim = result.hechos_eliminados ? ` (${result.hechos_eliminados} hechos antiguos eliminados)` : ""
        toast.success(`Publicado: ${result.hechos} hechos — ${pub}${elim}`)
      }
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operación fallida"
      setLastError(message)
      toast.error(message, { duration: 8000 })
    } finally {
      setBusy(null)
    }
  }

  const onUpload = async () => {
    if (!hogarFile || !individualFile) {
      toast.error("Sube usu_hogar y usu_individual del trimestre")
      return
    }
    await runAction("upload", () => uploadFeedSocioEphTrimestre(hogarFile, individualFile))
    setHogarFile(null)
    setIndividualFile(null)
  }

  const indicadores = [...new Set(staging.map((r) => r.indicador_clave))].sort()
  const stagingPeriodo = staging[0]?.fecha_dato
    ? (() => {
        const d = new Date(staging[0].fecha_dato)
        const t = Math.floor(d.getMonth() / 3) + 1
        return `${d.getFullYear()}-T${t}`
      })()
    : null

  const onConfigToggle = async (checked: boolean) => {
    setFeedConfig((c) => (c ? { ...c, borrar_trimestre_anterior_al_publicar: checked } : c))
    try {
      const cfg = await updateFeedSocioConfig(checked)
      setFeedConfig(cfg)
      toast.success(checked ? "Se borrarán trimestres anteriores al publicar" : "Configuración actualizada")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al guardar configuración"
      toast.error(message)
      await refresh()
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Feed APIs</h1>
              <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15">
                EPH trimestral
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Archivos oficiales <code className="text-xs">usu_hogar</code> +{" "}
              <code className="text-xs">usu_individual</code> (TXT INDEC) o descarga automática vía pyeph →
              agregación por aglomerado → staging → partidos.
            </p>
          </div>
          <Button variant="outline" size="sm" className="bg-white" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {lastError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="flex items-start justify-between gap-3">
                <span>{lastError}</span>
                <button
                  type="button"
                  onClick={() => setLastError(null)}
                  className="shrink-0 rounded p-1 hover:bg-destructive/10"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileSpreadsheet className="h-5 w-5" />
                EPH trimestral — conjunto de indicadores
              </CardTitle>
              <CardDescription>
                Indicadores calculados: pobreza, indigencia, desempleo, ocupación, informalidad. Tras publicar,
                activa cada métrica en{" "}
                <Link href="/metricas" className="text-primary underline-offset-2 hover:underline">
                  Gestión de Métricas
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">usu_hogar (TXT)</span>
                  <input
                    type="file"
                    accept=".txt,.csv"
                    className="block w-full text-sm"
                    disabled={busy !== null}
                    onChange={(e) => setHogarFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">usu_individual (TXT)</span>
                  <input
                    type="file"
                    accept=".txt,.csv"
                    className="block w-full text-sm"
                    disabled={busy !== null}
                    onChange={(e) => setIndividualFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="borrar-trimestre-anterior"
                    checked={feedConfig?.borrar_trimestre_anterior_al_publicar ?? false}
                    disabled={busy !== null || loading}
                    onCheckedChange={(v) => onConfigToggle(v === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="borrar-trimestre-anterior" className="text-sm font-medium leading-snug">
                      Borrar trimestre anterior al publicar nuevas
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Al publicar, elimina hechos de trimestres previos para cada métrica EPH (evita mezclar en mapa).
                    </p>
                  </div>
                </div>
                {feedConfig?.trimestre_referencia && (
                  <p className="text-xs text-muted-foreground">
                    Trimestre de referencia (último ingest):{" "}
                    <span className="font-medium text-foreground">{feedConfig.trimestre_referencia}</span>
                    {stagingPeriodo && stagingPeriodo !== feedConfig.trimestre_referencia && (
                      <span className="text-amber-700"> · Borrador: {stagingPeriodo}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy !== null}
                  onClick={() => runAction("download", downloadFeedSocioLatest)}
                >
                  {busy === "download" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CloudDownload className="mr-2 h-4 w-4" />
                  )}
                  Descargar último trimestre INDEC
                </Button>
                <Button
                  variant="outline"
                  className="bg-white"
                  disabled={busy !== null}
                  onClick={() => runAction("sample", ingestFeedSocioSample)}
                >
                  {busy === "sample" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Procesar T126 de ejemplo
                </Button>
                <Button disabled={busy !== null || !hogarFile || !individualFile} onClick={onUpload}>
                  {busy === "upload" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Subir trimestre
                </Button>
                <Button disabled={busy !== null || staging.length === 0} onClick={() => runAction("publish", publishFeedSocio)}>
                  {busy === "publish" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="mr-2 h-4 w-4" />
                  )}
                  Publicar todos los borradores
                </Button>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Borradores en staging</CardDescription>
                  <CardTitle className="text-2xl">{preview.staging_rows}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Hechos estimados al publicar</CardDescription>
                  <CardTitle className="text-2xl">{preview.partido_hechos_estimados}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Indicadores en borrador</CardDescription>
                  <CardTitle className="text-sm font-normal leading-snug">
                    {indicadores.length ? indicadores.join(", ") : "—"}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Staging por aglomerado e indicador</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando…
                </div>
              ) : staging.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin borradores. Procesa el trimestre T126 de ejemplo o sube usu_hogar + usu_individual.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicador</TableHead>
                      <TableHead>Aglomerado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Valor %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staging.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.indicador_clave}</TableCell>
                        <TableCell>{row.aglomerado_nombre}</TableCell>
                        <TableCell>{row.fecha_dato}</TableCell>
                        <TableCell className="text-right font-medium">{row.valor.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
