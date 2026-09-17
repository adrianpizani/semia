'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge, BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  labelForNivel,
  MapModeSwitcher,
  nivelForMapMode,
} from "@/components/map-mode-switcher"
import { getWorkspaceConfig, patchWorkspaceConfig, toggleMetrica, updateMetricaEscala, updateMetricaVista } from "@/lib/api"
import { Metrica, TipoMetricaEnum } from "@/lib/types"
import type { MapModo } from "@/hooks/use-map-view"

interface ArchivoForMetrica {
  id: number;
  nombre_visible: string;
}

interface MetricaItem extends Metrica {
  archivo: ArchivoForMetrica | null;
}

interface MetricasClienteProps {
  initialMetricas: MetricaItem[];
}

const TipoMetricaBadge: React.FC<{ tipo: TipoMetricaEnum }> = ({ tipo }) => {
  const typeStyles: Partial<Record<TipoMetricaEnum, { variant: BadgeProps['variant']; text: string; className?: string }>> = {
    [TipoMetricaEnum.ELECTORAL]: { variant: "default", text: "Electoral" },
    [TipoMetricaEnum.DEMOGRAFICA]: { variant: "secondary", text: "Demográfica" },
    [TipoMetricaEnum.GEOGRAFICA]: { variant: "outline", text: "Geográfica" },
    [TipoMetricaEnum.TEMPORAL]: { variant: "secondary", text: "Temporal" },
    [TipoMetricaEnum.ECONOMICA]: { variant: "secondary", text: "Económica" },
    [TipoMetricaEnum.PRENSA]: {
      variant: "secondary",
      text: "Prensa",
      className: "bg-amber-500/15 text-amber-900 hover:bg-amber-500/15",
    },
  };

  const style = typeStyles[tipo] ?? { variant: "default" as const, text: tipo };

  return (
    <Badge variant={style.variant} className={style.className}>
      {style.text}
    </Badge>
  );
};

function hasRangeScale(tipo: TipoMetricaEnum): boolean {
  return (
    tipo === TipoMetricaEnum.ECONOMICA ||
    tipo === TipoMetricaEnum.DEMOGRAFICA ||
    tipo === TipoMetricaEnum.PRENSA
  );
}

function canConfigureVista(tipo: TipoMetricaEnum): boolean {
  return (
    tipo === TipoMetricaEnum.ECONOMICA ||
    tipo === TipoMetricaEnum.DEMOGRAFICA ||
    tipo === TipoMetricaEnum.PRENSA
  );
}

function TrimestreBadge({ metrica }: { metrica: MetricaItem }) {
  if (!metrica.periodo_publicado) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const vigente = metrica.es_trimestre_vigente
  const ref = metrica.trimestre_referencia

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={vigente ? "default" : "secondary"} className={vigente ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
        {metrica.periodo_publicado}
      </Badge>
      {ref && !vigente && (
        <span className="text-xs text-amber-700">
          Referencia: {ref}
        </span>
      )}
      {vigente && (
        <span className="text-xs text-emerald-700">Trimestre vigente</span>
      )}
    </div>
  )
}

export function MetricasCliente({ initialMetricas }: MetricasClienteProps) {
  const [metricas, setMetricas] = useState<MetricaItem[]>(initialMetricas);
  const [mapModo, setMapModo] = useState<MapModo>("pba");
  const [modoReady, setModoReady] = useState(false);
  const [savingModo, setSavingModo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await getWorkspaceConfig();
        const defaults = (res.document.defaults as Record<string, unknown> | undefined) ?? {};
        const mapa = (defaults.mapa as Record<string, unknown> | undefined) ?? {};
        if (!cancelled && (mapa.modo === "pba" || mapa.modo === "nacional")) {
          setMapModo(mapa.modo);
        }
      } catch {
        // default pba
      } finally {
        if (!cancelled) setModoReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const nivelCapa = nivelForMapMode(mapModo);
  const metricasCapa = useMemo(
    () => metricas.filter(m => m.nivel_geografico === nivelCapa),
    [metricas, nivelCapa],
  );

  const handleMapModoChange = useCallback(async (next: MapModo) => {
    if (next === mapModo) return;
    const previous = mapModo;
    setMapModo(next);
    setSavingModo(true);
    try {
      await patchWorkspaceConfig({
        defaults: { mapa: { modo: next } },
      });
      toast.success(
        next === "nacional"
          ? "Capa nacional: solo métricas a nivel provincia"
          : "Capa PBA: solo métricas a nivel partido",
      );
    } catch {
      setMapModo(previous);
      toast.error("No se pudo guardar el alcance del mapa");
    } finally {
      setSavingModo(false);
    }
  }, [mapModo]);

  const handleToggle = async (metricId: number) => {
    setMetricas(currentMetricas =>
      currentMetricas.map(m =>
        m.id === metricId ? { ...m, is_active: !m.is_active } : m
      )
    );

    try {
      await toggleMetrica(metricId);
      toast.success("Estado de la métrica actualizado");
    } catch (error) {
      toast.error("Error al actualizar la métrica");
      setMetricas(currentMetricas =>
        currentMetricas.map(m =>
          m.id === metricId ? { ...m, is_active: !m.is_active } : m
        )
      );
    }
  };

  const handleEscalaChange = async (metricId: number, value: string) => {
    const escala_rango = value === "auto" ? null : value as 'log' | 'linear';
    const previous = metricas.find(m => m.id === metricId)?.escala_rango ?? null;

    setMetricas(current =>
      current.map(m => m.id === metricId ? { ...m, escala_rango } : m)
    );

    try {
      await updateMetricaEscala(metricId, escala_rango);
      toast.success("Escala de filtro actualizada");
    } catch (error) {
      toast.error("Error al actualizar la escala");
      setMetricas(current =>
        current.map(m => m.id === metricId ? { ...m, escala_rango: previous } : m)
      );
    }
  };

  const handleVistaToggle = async (
    metricId: number,
    field: "mostrar_cruce" | "mostrar_hotspots",
    next: boolean,
  ) => {
    const previous = metricas.find(m => m.id === metricId);
    setMetricas(current =>
      current.map(m => m.id === metricId ? { ...m, [field]: next } : m)
    );
    try {
      await updateMetricaVista(metricId, { [field]: next });
      toast.success(field === "mostrar_cruce" ? "Cruce actualizado" : "Hotspots actualizado");
    } catch {
      toast.error("Error al actualizar la vista");
      if (previous) {
        setMetricas(current =>
          current.map(m => m.id === metricId ? { ...m, [field]: previous[field] } : m)
        );
      }
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <h1 className="text-2xl font-semibold">Gestión de Métricas</h1>
        <p className="text-sm text-muted-foreground">
          Activá métricas de la capa actual del mapa. Cruce = scatter electoral; Hotspots = puntos
          sobre el mapa (útil en prensa).
        </p>
      </div>

      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Capa del mapa</CardTitle>
              <CardDescription>
                Mismo setting que Configuración → Mapa (<code className="text-xs">defaults.mapa.modo</code>).
                Solo se listan métricas con hechos en ese nivel geográfico.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!modoReady ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando alcance…
                </div>
              ) : (
                <MapModeSwitcher
                  value={mapModo}
                  onChange={handleMapModoChange}
                  disabled={savingModo}
                />
              )}
              <p className="text-xs text-muted-foreground">
                También podés cambiarlo en{" "}
                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                  <Link href="/configuracion">Configuración → Mapa</Link>
                </Button>
                .
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Métricas de la capa</CardTitle>
                <Badge variant="outline">{labelForNivel(nivelCapa)}</Badge>
                <Badge variant="secondary">{metricasCapa.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[24%]">Métrica</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead>Trimestre EPH</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Escala</TableHead>
                    <TableHead className="text-center">Cruce</TableHead>
                    <TableHead className="text-center">Hotspots</TableHead>
                    <TableHead className="text-right">Activa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!modoReady ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Filtrando por capa…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : metricasCapa.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        {mapModo === "nacional"
                          ? "No hay métricas a nivel provincia. Cargá datos nacionales o volvé a la capa PBA."
                          : "No se encontraron métricas a nivel partido. Subí un archivo para generarlas."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    metricasCapa.map((metrica) => (
                      <TableRow key={metrica.id}>
                        <TableCell className="font-medium">{metrica.nombre_amigable}</TableCell>
                        <TableCell>
                          <TipoMetricaBadge tipo={metrica.tipo} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{labelForNivel(metrica.nivel_geografico)}</Badge>
                        </TableCell>
                        <TableCell>
                          <TrimestreBadge metrica={metrica} />
                        </TableCell>
                        <TableCell>
                          {metrica.archivo ? (
                            <Badge variant="outline">{metrica.archivo.nombre_visible}</Badge>
                          ) : (
                            <Badge variant="secondary">N/A</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasRangeScale(metrica.tipo) ? (
                            <Select
                              value={metrica.escala_rango ?? "auto"}
                              onValueChange={(value) => handleEscalaChange(metrica.id, value)}
                            >
                              <SelectTrigger className="w-[130px] bg-white hover:bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Automática</SelectItem>
                                <SelectItem value="linear">Lineal</SelectItem>
                                <SelectItem value="log">Logarítmica</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {canConfigureVista(metrica.tipo) ? (
                            <Switch
                              checked={metrica.mostrar_cruce !== false}
                              onCheckedChange={(v) => handleVistaToggle(metrica.id, "mostrar_cruce", v)}
                              aria-label={`Cruce ${metrica.nombre_amigable}`}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {canConfigureVista(metrica.tipo) ? (
                            <Switch
                              checked={metrica.mostrar_hotspots === true}
                              onCheckedChange={(v) => handleVistaToggle(metrica.id, "mostrar_hotspots", v)}
                              aria-label={`Hotspots ${metrica.nombre_amigable}`}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={metrica.is_active}
                            onCheckedChange={() => handleToggle(metrica.id)}
                            aria-label={`Activar métrica ${metrica.nombre_amigable}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
