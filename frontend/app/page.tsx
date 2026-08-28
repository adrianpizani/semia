"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import dynamic from 'next/dynamic';
import Link from "next/link"
import { FilterBar } from "@/components/filter-bar"
import { DashboardCharts } from "@/components/dashboard-charts"
import { CruceScatter } from "@/components/cruce-scatter"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Medal, Table2 } from "lucide-react"
import { formatCompact } from "@/lib/range-utils"
import { MunicipioTooltipSecondaries } from "@/lib/types"
import { getPartyVoteShare } from "@/lib/party-color"
import { formatRank, rankDescending } from "@/lib/ranking"
import { useDashboardView } from "@/hooks/use-dashboard-view"

const MapViewClient = dynamic(() => import('@/components/map-view-client'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100"><p>Cargando mapa...</p></div>,
});

const getTopParties = (resultados: any[], count = 3) => {
  if (!resultados || resultados.length === 0) return []

  const totalVotos = resultados.reduce((sum, partido) => sum + partido.votos, 0)
  if (totalVotos === 0) return []

  return resultados
    .sort((a, b) => b.votos - a.votos)
    .slice(0, count)
    .map(partido => ({
      ...partido,
      porcentaje: ((partido.votos / totalVotos) * 100).toFixed(1),
    }))
}

export default function DashboardPage() {
  const view = useDashboardView()
  const [selectedMunicipio, setSelectedMunicipio] = useState<any | null>(null)
  const [selectedCircuito, setSelectedCircuito] = useState<any | null>(null)

  useEffect(() => {
    setSelectedMunicipio(null)
    setSelectedCircuito(null)
  }, [view.selectedPrimaryMetric, view.electoralQueryKey])

  const handleMunicipioClick = useCallback((municipio: any) => {
    if (selectedMunicipio && selectedMunicipio.id === municipio.id) {
      setSelectedMunicipio(null);
    } else {
      setSelectedMunicipio(municipio);
    }
    setSelectedCircuito(null);
  }, [selectedMunicipio]);

  const handleCircuitoClick = useCallback((circuito: any) => {
    if (selectedCircuito && selectedCircuito.id === circuito.id) {
      setSelectedCircuito(null);
    } else {
      setSelectedCircuito(circuito);
    }
  }, [selectedCircuito]);

  const handleCrucePointClick = useCallback((geografiaId: number, nombre: string) => {
    if (selectedMunicipio && selectedMunicipio.id === geografiaId) {
      setSelectedMunicipio(null);
    } else {
      setSelectedMunicipio({ id: geografiaId, properties: { nombre, nivel: "Partido" } });
    }
    setSelectedCircuito(null);
  }, [selectedMunicipio]);

  const selectedMunicipioData = view.electoralData && selectedMunicipio
    ? view.electoralData.find(d => d.geografia_id === selectedMunicipio.id)
    : null;

  const selectedMunicipioSecondaryMetricsData = selectedMunicipio
    ? view.selectedSecondaryMetrics
        .map(metricId => {
          const metricDataForGeo = view.secondaryMetricsData[metricId]?.find(d => d.geografia_id === selectedMunicipio.id);
          const metricInfo = view.activeMetrics.find(m => m.id === metricId);
          if (metricDataForGeo && metricInfo) {
            return { ...metricDataForGeo, tipo: metricInfo.tipo };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  const topParties = selectedMunicipioData ? getTopParties(selectedMunicipioData.resultados) : []
  const primaryMetricName = view.activeMetrics.find(m => m.id === view.selectedPrimaryMetric)?.nombre_amigable || "Métrica Principal";
  const selectedPartyShare = selectedMunicipioData && view.selectedParty
    ? getPartyVoteShare(selectedMunicipioData.resultados, view.selectedParty)
    : null;
  const selectedPartyVotos = selectedMunicipioData && view.selectedParty
    ? selectedMunicipioData.resultados.find((r: { partido: string }) => r.partido === view.selectedParty)?.votos ?? 0
    : null;

  const secondaryByGeo = useMemo((): MunicipioTooltipSecondaries => {
    const byGeo: MunicipioTooltipSecondaries = {};
    for (const metricId of view.selectedSecondaryMetrics) {
      const rows = view.secondaryMetricsData[metricId] ?? [];
      for (const row of rows) {
        if (row.valor === null || !Number.isFinite(row.valor)) continue;
        if (!byGeo[row.geografia_id]) byGeo[row.geografia_id] = [];
        byGeo[row.geografia_id].push({ nombre: row.metrica_nombre, valor: row.valor });
      }
    }
    return byGeo;
  }, [view.selectedSecondaryMetrics, view.secondaryMetricsData]);

  return (
    <div className="flex h-screen flex-col">
      <FilterBar
        activeMetrics={view.activeMetrics}
        selectedPrimaryMetric={view.selectedPrimaryMetric}
        onPrimaryMetricChange={view.setSelectedPrimaryMetric}
        selectedSecondaryMetrics={view.selectedSecondaryMetrics}
        onSecondaryMetricsChange={view.setSelectedSecondaryMetrics}
        filters={view.filters}
        onFiltersChange={view.handleFiltersChange}
        availableParties={view.availableParties}
        availableYears={view.availableYears}
        availableVoteTypes={view.availableVoteTypes}
        metricRanges={view.metricRanges}
        actions={
          <Button variant="outline" size="sm" className="bg-white hover:bg-white" asChild={!!view.selectedPrimaryMetric} disabled={!view.selectedPrimaryMetric}>
            {view.selectedPrimaryMetric ? (
              <Link href="/analisis">
                <Table2 className="mr-1 h-4 w-4" />
                Ver análisis
              </Link>
            ) : (
              <span className="inline-flex items-center">
                <Table2 className="mr-1 h-4 w-4" />
                Ver análisis
              </span>
            )}
          </Button>
        }
      />
      <div className="flex flex-1 gap-4 overflow-hidden bg-amber-50/70 p-4">
        <div className="flex-[3] overflow-hidden rounded-lg border border-border">
          <MapViewClient
            selectedMetric={view.selectedPrimaryMetric}
            electoralData={view.electoralData}
            onMunicipioClick={handleMunicipioClick}
            onCircuitoClick={handleCircuitoClick}
            isLoading={view.isLoading}
            selectedMunicipio={selectedMunicipio}
            selectedCircuito={selectedCircuito}
            highlightParty={view.selectedParty}
            secondaryByGeo={secondaryByGeo}
          />
        </div>
        <div className="flex-[2] space-y-4 overflow-y-auto">
          {selectedCircuito && (
            <Card className="border-blue-500 bg-blue-50/50">
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  Circuito seleccionado
                </CardTitle>
                <CardDescription className="text-blue-900 font-medium">
                  {selectedCircuito.properties?.nombre}
                  {selectedMunicipio ? ` · ${selectedMunicipio.properties?.nombre}` : ""}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectedMunicipioData ? `Resultados en ${selectedMunicipioData.nombre}` : primaryMetricName}
                </CardTitle>
                <CardDescription className="text-sm">
                  {selectedMunicipioData
                    ? view.selectedParty && selectedPartyShare !== null
                      ? `${view.selectedParty}: ${(selectedPartyShare * 100).toFixed(1)}% (${(selectedPartyVotos ?? 0).toLocaleString('es-AR')} votos)`
                      : `Total de votos: ${selectedMunicipioData.resultados.reduce((acc: number, p: any) => acc + p.votos, 0).toLocaleString('es-AR')}`
                    : "Selecciona un municipio en el mapa para ver los detalles"}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1 space-y-1.5">
                {selectedMunicipioData && topParties.length > 0 ? (
                  topParties.map((partido, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{partido.partido}</span>
                        <span className="text-muted-foreground">{partido.porcentaje}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-blue-500" style={{ width: `${partido.porcentaje}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {selectedMunicipio ? "No hay datos de resultados para este municipio." : "Los resultados del municipio seleccionado aparecerán aquí."}
                  </div>
                )}
              </CardContent>
            </Card>
            {selectedMunicipio && (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Indicadores seleccionados</CardTitle>
                  <CardDescription className="text-sm">{selectedMunicipio.properties?.nombre ?? selectedMunicipioSecondaryMetricsData[0]?.geografia_nombre ?? ""}</CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {selectedMunicipioSecondaryMetricsData.length > 0 ? (
                    <ul className="divide-y">
                      {selectedMunicipioSecondaryMetricsData.map((data, index) => {
                        const rank = data.valor !== null
                          ? rankDescending(
                              (view.secondaryMetricsData[data.metrica_id] ?? [])
                                .map(row => row.valor)
                                .filter((v): v is number => v !== null && Number.isFinite(v)),
                              data.valor,
                            )
                          : null;
                        return (
                          <li key={index} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                            <span className="text-sm text-muted-foreground truncate" title={data.metrica_nombre}>
                              {data.metrica_nombre}
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                {data.valor !== null ? formatCompact(data.valor) : 'N/A'}
                              </span>
                              {rank && (
                                <span
                                  className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground tabular-nums"
                                  title="Puesto entre municipios. El 1 es el valor más alto."
                                >
                                  <Medal className="h-3 w-3 shrink-0" aria-hidden />
                                  <span>Puesto {formatRank(rank.rank, rank.n)}</span>
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sumá métricas secundarias desde la barra superior para ver sus valores acá.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {view.showCruce && view.cruceMetricId && view.electoralData ? (
            <CruceScatter
              electoralData={view.electoralData}
              secondaryData={view.secondaryMetricsData[view.cruceMetricId] ?? []}
              secondaryOptions={view.numericSecondaries}
              selectedSecondaryId={view.cruceMetricId}
              onSecondaryChange={view.setCruceMetricId}
              selectedParty={view.selectedParty}
              selectedGeografiaId={selectedMunicipio?.id ?? null}
              onPointClick={handleCrucePointClick}
              rangeFilterActive={view.cruceRangeFilterActive}
            />
          ) : selectedMunicipioData ? (
            <DashboardCharts selectionData={selectedMunicipioData} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
