"use client"

import { useState, useEffect, useCallback, SetStateAction } from "react"
import dynamic from 'next/dynamic';
import { useRouter } from "next/navigation"
import { FilterBar } from "@/components/filter-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"
import { getMetricas, getElectoralData, getGenericMetricData } from "@/lib/api"
import { Metrica, TipoMetricaEnum, GenericData, AnyFiltro } from "@/lib/types"

const MapViewClient = dynamic(() => import('@/components/map-view-client'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100"><p>Cargando mapa...</p></div>,
});

// --- Helper Function ---
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

// --- Main Component ---
export default function DashboardPage() {
  const [activeMetrics, setActiveMetrics] = useState<Metrica[]>([])
  const [selectedPrimaryMetric, setSelectedPrimaryMetric] = useState<number | null>(null)
  const [selectedSecondaryMetrics, setSelectedSecondaryMetrics] = useState<number[]>([])
  const [filters, setFilters] = useState<AnyFiltro[]>([])
  const [selectedMunicipio, setSelectedMunicipio] = useState<any | null>(null)
  const [electoralData, setElectoralData] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [secondaryMetricsData, setSecondaryMetricsData] = useState<{[metricId: number]: GenericData[]}>({});
  const [availableParties, setAvailableParties] = useState<string[]>([]);
  const [metricRanges, setMetricRanges] = useState<{[metricId: number]: {min: number, max: number}}>({});
  const router = useRouter();

  const handleReportClick = useCallback(() => {
    if (selectedMunicipio) {
      const query = new URLSearchParams();
      query.append("geografia_id", selectedMunicipio.id.toString());
      if (selectedPrimaryMetric) {
        query.append("metrica_1", selectedPrimaryMetric.toString());
      }
      if (selectedSecondaryMetrics.length > 0) {
        query.append("metrica_2", selectedSecondaryMetrics[0].toString());
      } else {
        // Por defecto para demostración si no hay secundaria seleccionada
        query.append("metrica_2", "2"); 
      }
      router.push(`/graficos?${query.toString()}`);
    }
  }, [selectedMunicipio, selectedPrimaryMetric, selectedSecondaryMetrics, router]);

  // Fetch active metrics on mount
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const allMetrics = await getMetricas()
        setActiveMetrics(allMetrics.filter(m => m.is_active))
      } catch (error) {
        console.error("Error fetching active metrics:", error)
      }
    }
    fetchMetrics()
  }, [])

  // Reset available parties when primary metric changes
  useEffect(() => {
    setAvailableParties([]);
  }, [selectedPrimaryMetric]);

  // Fetch electoral data when primary metric or filters change
  useEffect(() => {
    const fetchElectoralData = async () => {
      if (selectedPrimaryMetric === null) {
        setElectoralData(null)
        setSelectedMunicipio(null)
        return
      }

      const metricInfo = activeMetrics.find(m => m.id === selectedPrimaryMetric)

      if (metricInfo?.tipo === TipoMetricaEnum.ELECTORAL) {
        setIsLoading(true)
        try {
          const data = await getElectoralData(selectedPrimaryMetric, filters)
          setElectoralData(data)
          
          // Extract and merge unique parties
          if (data && data.length > 0) {
            setAvailableParties(prevParties => {
              const partiesSet = new Set(prevParties);
              data.forEach((d: any) => {
                d.resultados.forEach((r: any) => partiesSet.add(r.partido));
              });
              return Array.from(partiesSet).sort();
            });
          }
        } catch (error) {
          console.error("Error fetching electoral data:", error)
          setElectoralData(null)
        } finally {
          setIsLoading(false)
        }
      } else {
        setElectoralData(null)
      }
      setSelectedMunicipio(null)
    }

    fetchElectoralData()
  }, [selectedPrimaryMetric, filters, activeMetrics])

  // Fetch data for selected secondary metrics when they or filters change
  useEffect(() => {
    const fetchSecondaryData = async () => {
      const newSecondaryMetricsData: {[metricId: number]: GenericData[]} = { ...secondaryMetricsData };
      const metricsToFetch: number[] = [];
      const currentlySelectedGenericMetrics = new Set<number>();

      for (const metricId of selectedSecondaryMetrics) {
        const metricInfo = activeMetrics.find(m => m.id === metricId);
        if (metricInfo && metricInfo.tipo !== TipoMetricaEnum.ELECTORAL) {
          currentlySelectedGenericMetrics.add(metricId);
          metricsToFetch.push(metricId);
        }
      }

      if (metricsToFetch.length > 0) {
        await Promise.all(metricsToFetch.map(async (metricId) => {
          try {
            const data = await getGenericMetricData(metricId, filters);
            newSecondaryMetricsData[metricId] = data;

            // Calculate min/max for this metric
            if (data && data.length > 0) {
              const values = data.map(d => d.valor).filter((v): v is number => v !== null);
              if (values.length > 0) {
                setMetricRanges(prev => ({
                  ...prev,
                  [metricId]: { min: Math.min(...values), max: Math.max(...values) }
                }));
              }
            }
          } catch (error) {
            console.error(`Error fetching data for secondary metric ${metricId}:`, error);
            newSecondaryMetricsData[metricId] = [];
          }
        }));
      }

      const cleanedSecondaryMetricsData: {[metricId: number]: GenericData[]} = {};
      for (const metricId of Array.from(currentlySelectedGenericMetrics)) {
        if (newSecondaryMetricsData[metricId]) {
          cleanedSecondaryMetricsData[metricId] = newSecondaryMetricsData[metricId];
        }
      }
      
      if (JSON.stringify(cleanedSecondaryMetricsData) !== JSON.stringify(secondaryMetricsData)) {
        setSecondaryMetricsData(cleanedSecondaryMetricsData);
      }
    };

    fetchSecondaryData();
  }, [selectedSecondaryMetrics, filters, activeMetrics]);

  const handleMunicipioClick = useCallback((municipio: any) => {
    if (selectedMunicipio && selectedMunicipio.id === municipio.id) {
      setSelectedMunicipio(null);
    } else {
      setSelectedMunicipio(municipio);
    }
  }, [selectedMunicipio]);

  const handleFiltersChange = useCallback((updater: SetStateAction<AnyFiltro[]>) => {
    setFilters(updater);
  }, []);

  const selectedMunicipioData = electoralData && selectedMunicipio
    ? electoralData.find(d => d.geografia_id === selectedMunicipio.id)
    : null;

  const selectedMunicipioSecondaryMetricsData = selectedMunicipio
    ? selectedSecondaryMetrics
        .map(metricId => {
          const metricDataForGeo = secondaryMetricsData[metricId]?.find(d => d.geografia_id === selectedMunicipio.id);
          const metricInfo = activeMetrics.find(m => m.id === metricId);
          if (metricDataForGeo && metricInfo) {
            return { ...metricDataForGeo, tipo: metricInfo.tipo };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  const topParties = selectedMunicipioData ? getTopParties(selectedMunicipioData.resultados) : []
  const primaryMetricName = activeMetrics.find(m => m.id === selectedPrimaryMetric)?.nombre_amigable || "Métrica Principal";

  return (
    <div className="flex h-screen flex-col">
      <FilterBar
        activeMetrics={activeMetrics}
        selectedPrimaryMetric={selectedPrimaryMetric}
        onPrimaryMetricChange={setSelectedPrimaryMetric}
        selectedSecondaryMetrics={selectedSecondaryMetrics}
        onSecondaryMetricsChange={setSelectedSecondaryMetrics}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableParties={availableParties}
        metricRanges={metricRanges}
      />
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        <div className="flex-[3] overflow-hidden rounded-lg border border-border">
          <MapViewClient
            selectedMetric={selectedPrimaryMetric}
            electoralData={electoralData}
            onMunicipioClick={handleMunicipioClick}
            isLoading={isLoading}
            selectedMunicipio={selectedMunicipio}
          />
        </div>
        <div className="flex-[2] space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedMunicipioData ? `Resultados en ${selectedMunicipioData.nombre}` : primaryMetricName}
              </CardTitle>
              <CardDescription>
                {selectedMunicipioData
                  ? `Total de votos: ${selectedMunicipioData.resultados.reduce((acc: number, p: any) => acc + p.votos, 0).toLocaleString('es-AR')}`
                  : "Selecciona un municipio en el mapa para ver los detalles"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedMunicipioData && topParties.length > 0 ? (
                topParties.map((partido, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{partido.partido}</span>
                      <span className="text-muted-foreground">{partido.porcentaje}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-blue-500" style={{ width: `${partido.porcentaje}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  {selectedMunicipio ? "No hay datos de resultados para este municipio." : "Los resultados del municipio seleccionado aparecerán aquí."}
                </div>
              )}
              {selectedMunicipio && (
                <div className="pt-4 mt-2 border-t">
                  <Button className="w-full gap-2" onClick={handleReportClick}>
                    <FileText className="h-4 w-4" />
                    Reportar Municipio
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          {selectedMunicipioSecondaryMetricsData.map((data, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="text-base">{data.metrica_nombre}</CardTitle>
                <CardDescription>{`Datos para ${data.geografia_nombre}`}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {data.valor !== null ? data.valor.toLocaleString('es-AR') : 'N/A'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
