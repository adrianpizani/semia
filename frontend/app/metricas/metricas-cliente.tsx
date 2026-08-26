'use client'

import { useState } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge, BadgeProps } from "@/components/ui/badge"
import { toggleMetrica, updateMetricaEscala } from "@/lib/api"
import { TipoMetricaEnum } from "@/lib/types"

interface ArchivoForMetrica {
  id: number;
  nombre_visible: string;
}

interface MetricaItem {
  id: number;
  nombre_amigable: string;
  is_active: boolean;
  tipo: TipoMetricaEnum;
  escala_rango?: 'log' | 'linear' | null;
  archivo: ArchivoForMetrica | null;
}

interface MetricasClienteProps {
  initialMetricas: MetricaItem[];
}

const TipoMetricaBadge: React.FC<{ tipo: TipoMetricaEnum }> = ({ tipo }) => {
  const typeStyles: Partial<Record<TipoMetricaEnum, { variant: BadgeProps['variant']; text: string }>> = {
    [TipoMetricaEnum.ELECTORAL]: { variant: "default", text: "Electoral" },
    [TipoMetricaEnum.DEMOGRAFICA]: { variant: "secondary", text: "Demográfica" },
    [TipoMetricaEnum.GEOGRAFICA]: { variant: "outline", text: "Geográfica" },
    [TipoMetricaEnum.TEMPORAL]: { variant: "secondary", text: "Temporal" },
    [TipoMetricaEnum.ECONOMICA]: { variant: "secondary", text: "Económica" },
  };

  const style = typeStyles[tipo] ?? { variant: "default" as const, text: tipo };

  return <Badge variant={style.variant}>{style.text}</Badge>;
};

function hasRangeScale(tipo: TipoMetricaEnum): boolean {
  return tipo === TipoMetricaEnum.ECONOMICA || tipo === TipoMetricaEnum.DEMOGRAFICA;
}

export function MetricasCliente({ initialMetricas }: MetricasClienteProps) {
  const [metricas, setMetricas] = useState<MetricaItem[]>(initialMetricas);

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

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <h1 className="text-2xl font-semibold">Gestión de Métricas</h1>
        <p className="text-sm text-muted-foreground">
          Activá métricas para el mapa y configurá la escala del slider de filtro (lineal o logarítmica).
        </p>
      </div>

      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-7xl">
          <Card className="border-border/80 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Métricas Disponibles</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Métrica</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Archivo de Origen</TableHead>
                    <TableHead>Escala de filtro</TableHead>
                    <TableHead className="text-right">Activa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No se encontraron métricas. Sube un archivo para generarlas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metricas.map((metrica) => (
                      <TableRow key={metrica.id}>
                        <TableCell className="font-medium">{metrica.nombre_amigable}</TableCell>
                        <TableCell>
                          <TipoMetricaBadge tipo={metrica.tipo} />
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
                              <SelectTrigger className="w-[150px] bg-white hover:bg-white">
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
