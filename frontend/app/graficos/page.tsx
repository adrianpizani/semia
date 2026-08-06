"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
} from "recharts"
import { TrendingUp, Users, Vote, BarChartIcon, Activity, ArrowLeft } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { getElectoralData, getGenericMetricData } from "@/lib/api"
import { ElectoralData, GenericData } from "@/lib/types"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const participationTrendData = [
  { month: "Ene", 2023: 62, 2024: 65 },
  { month: "Feb", 2023: 63, 2024: 66 },
  { month: "Mar", 2023: 64, 2024: 67 },
  { month: "Abr", 2023: 65, 2024: 68 },
  { month: "May", 2023: 66, 2024: 69 },
  { month: "Jun", 2023: 67, 2024: 70 },
]

const defaultPartyComparisonData = [
  { party: "Partido A", 2020: 420000, 2022: 435000, 2024: 450000 },
  { party: "Partido B", 2020: 480000, 2022: 505000, 2024: 520000 },
  { party: "Partido C", 2020: 350000, 2022: 365000, 2024: 380000 },
]

const regionPerformanceData = [
  { region: "Norte", participacion: 72, satisfaccion: 68, crecimiento: 85 },
  { region: "Centro", participacion: 78, satisfaccion: 75, crecimiento: 90 },
  { region: "Sur", participacion: 65, satisfaccion: 62, crecimiento: 70 },
  { region: "Este", participacion: 80, satisfaccion: 78, crecimiento: 88 },
  { region: "Oeste", participacion: 68, satisfaccion: 65, crecimiento: 75 },
]

const demographicDetailData = [
  { name: "18-25", hombres: 45000, mujeres: 48000 },
  { name: "26-40", hombres: 125000, mujeres: 130000 },
  { name: "41-60", hombres: 110000, mujeres: 115000 },
  { name: "60+", hombres: 65000, mujeres: 70000 },
]

const hourlyVotingData = [
  { hora: "8:00", votos: 12000 },
  { hora: "10:00", votos: 45000 },
  { hora: "12:00", votos: 78000 },
  { hora: "14:00", votos: 95000 },
  { hora: "16:00", votos: 110000 },
  { hora: "18:00", votos: 85000 },
]

function GraficosContent() {
  const searchParams = useSearchParams()
  const geografia_id = searchParams.get("geografia_id")
  const metrica_1 = searchParams.get("metrica_1") || searchParams.get("metrica_id")
  const metrica_2 = searchParams.get("metrica_2")

  const [municipioData, setMunicipioData] = useState<ElectoralData | null>(null)
  const [genericData, setGenericData] = useState<GenericData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (geografia_id && metrica_1) {
        setIsLoading(true)
        try {
          // Cargar métrica electoral (Métrica 1)
          const data = await getElectoralData(Number(metrica_1))
          const selected = data.find((d: ElectoralData) => d.geografia_id === Number(geografia_id))
          if (selected) {
            setMunicipioData(selected)
          }

          // Cargar métrica genérica/socioeconómica (Métrica 2) si está presente
          if (metrica_2) {
            const genericRes = await getGenericMetricData(Number(metrica_2))
            const selectedGeneric = genericRes.find((d: GenericData) => d.geografia_id === Number(geografia_id))
            if (selectedGeneric) {
              setGenericData(selectedGeneric)
            }
          }

        } catch (error) {
          console.error("Error al cargar datos específicos:", error)
        } finally {
          setIsLoading(false)
        }
      }
    }
    fetchData()
  }, [geografia_id, metrica_1, metrica_2])

  // Preparamos los datos dinámicos si existen (para 1 o 2 métricas)
  const dynamicPartyData = municipioData 
    ? municipioData.resultados.map(r => ({ 
        party: r.partido, 
        Votos: r.votos,
        // Agregamos el valor genérico (ej. PBG o Pobreza) como un dato constante para la línea
        [genericData?.metrica_nombre || 'Socioeconómico']: genericData?.valor || 0
      }))
    : []

  const totalVotosDynamic = municipioData 
    ? municipioData.resultados.reduce((acc, curr) => acc + curr.votos, 0)
    : 2543890;

  const titlePrefix = genericData && municipioData 
    ? `Cruce Electoral vs ${genericData.metrica_nombre}`
    : `Reporte de Selección`;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <div className="flex flex-col gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="w-fit gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al Mapa
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Análisis y Gráficos</h1>
          <p className="text-muted-foreground">
            {municipioData 
              ? `Mostrando reporte detallado para: ${municipioData.nombre}`
              : 'Visualización detallada de datos electorales y tendencias'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {/* KPI 1: Votantes (Parcialmente real si hay datos) */}
        <Card className={!municipioData ? "opacity-60 grayscale border-dashed" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Votantes {!municipioData && <span className="text-xs font-normal text-muted-foreground ml-1">(Ejemplo)</span>}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalVotosDynamic.toLocaleString('es-AR')}
            </div>
            {!municipioData && (
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+12.5%</span> vs año anterior
              </p>
            )}
          </CardContent>
        </Card>

        {/* KPI 2: Ganador Electoral (Parcialmente real si hay datos) */}
        <Card className={!municipioData ? "opacity-60 grayscale border-dashed" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {municipioData ? 'Fuerza Ganadora' : 'Participación'} {!municipioData && <span className="text-xs font-normal text-muted-foreground ml-1">(Ejemplo)</span>}
            </CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate" title={municipioData ? municipioData.ganador?.partido : ''}>
              {municipioData ? (municipioData.ganador?.partido || 'N/A') : '68.4%'}
            </div>
            {!municipioData && (
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">+3.2%</span> vs promedio
              </p>
            )}
          </CardContent>
        </Card>

        {/* KPI 3: Métrica Genérica (Socioeconómica) o Tendencia */}
        <Card className={!genericData ? "opacity-60 grayscale border-dashed" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate">
              {genericData ? genericData.metrica_nombre : 'Tendencia'} {!genericData && <span className="text-xs font-normal text-muted-foreground ml-1">(Ejemplo)</span>}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {genericData 
                ? (genericData.valor !== null ? genericData.valor.toLocaleString('es-AR') : 'N/D') 
                : '+5.8%'}
            </div>
            {!genericData && (
              <p className="text-xs text-muted-foreground">Crecimiento mensual</p>
            )}
            {genericData && (
               <p className="text-xs text-muted-foreground">Valor registrado para el distrito</p>
            )}
          </CardContent>
        </Card>

        {/* KPI 4: Regiones Activas (Siempre Mocked) */}
        <Card className="opacity-60 grayscale border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Regiones Activas <span className="text-xs font-normal text-muted-foreground ml-1">(Ejemplo)</span>
            </CardTitle>
            <BarChartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">24/32</div>
            <p className="text-xs text-muted-foreground">75% de cobertura</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={municipioData ? "resultados_locales" : "tendencias"} className="flex-1">
        <TabsList className="grid w-full grid-cols-5">
          {municipioData && <TabsTrigger value="resultados_locales" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{titlePrefix}</TabsTrigger>}
          <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
          <TabsTrigger value="comparativa">Comparativa</TabsTrigger>
          <TabsTrigger value="regional">Regional</TabsTrigger>
          <TabsTrigger value="demografico">Demográfico</TabsTrigger>
        </TabsList>

        {municipioData && (
          <TabsContent value="resultados_locales" className="space-y-4">
            <Card className="border-primary/50 shadow-md">
              <CardHeader>
                <CardTitle>Resultados Electorales {genericData ? `con contexto de ${genericData.metrica_nombre}` : ''}</CardTitle>
                <CardDescription>
                  {genericData 
                    ? `Distribución de votos en ${municipioData.nombre} contrastados con su índice de ${genericData.metrica_nombre}`
                    : `Distribución de votos por partido político en ${municipioData.nombre}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  {genericData ? (
                    <ComposedChart data={dynamicPartyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="party" angle={-45} textAnchor="end" height={100} interval={0} fontSize={12} />
                      {/* Eje Izquierdo: Votos */}
                      <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" />
                      {/* Eje Derecho: Indicador Socioeconómico */}
                      <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" />
                      <Tooltip formatter={(value: number) => value.toLocaleString('es-AR')} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar yAxisId="left" dataKey="Votos" fill="#3b82f6" name="Votos" />
                      {/* La línea mostrará el valor constante de la métrica 2 para dar contexto visual contra el volumen de votos */}
                      <Line yAxisId="right" type="monotone" dataKey={genericData.metrica_nombre} stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={false} />
                    </ComposedChart>
                  ) : (
                    <BarChart data={dynamicPartyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="party" angle={-45} textAnchor="end" height={100} interval={0} fontSize={12} />
                      <YAxis />
                      <Tooltip formatter={(value: number) => value.toLocaleString('es-AR')} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar dataKey="Votos" fill="#3b82f6" name="Votos" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ... (resto de las pestañas estáticas) */}
        <TabsContent value="tendencias" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="opacity-60 grayscale border-dashed">
              <CardHeader>
                <CardTitle>Evolución de Participación</CardTitle>
                <CardDescription>Comparación interanual por mes <span className="font-semibold text-muted-foreground">(Datos de ejemplo)</span></CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={participationTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="2023" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" />
                    <Area type="monotone" dataKey="2024" stackId="2" stroke="#3b82f6" fill="#3b82f6" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="opacity-60 grayscale border-dashed">
              <CardHeader>
                <CardTitle>Flujo de Votación por Hora</CardTitle>
                <CardDescription>Distribución horaria del día electoral <span className="font-semibold text-muted-foreground">(Datos de ejemplo)</span></CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={hourlyVotingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hora" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="votos" stroke="#22c55e" strokeWidth={3} name="Votos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comparativa" className="space-y-4">
          <Card className="opacity-60 grayscale border-dashed">
            <CardHeader>
              <CardTitle>Evolución de Votos por Partido (General)</CardTitle>
              <CardDescription>Comparación de resultados en las últimas 3 elecciones <span className="font-semibold text-muted-foreground">(Datos de ejemplo)</span></CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={defaultPartyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="party" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="2020" fill="#8b5cf6" name="2020" />
                  <Bar dataKey="2022" fill="#3b82f6" name="2022" />
                  <Bar dataKey="2024" fill="#22c55e" name="2024" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regional" className="space-y-4">
          <Card className="opacity-60 grayscale border-dashed">
            <CardHeader>
              <CardTitle>Análisis Multidimensional por Región</CardTitle>
              <CardDescription>Participación, satisfacción y crecimiento <span className="font-semibold text-muted-foreground">(Datos de ejemplo)</span></CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={regionPerformanceData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="region" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Participación"
                    dataKey="participacion"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.6}
                  />
                  <Radar name="Satisfacción" dataKey="satisfaccion" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                  <Radar name="Crecimiento" dataKey="crecimiento" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demografico" className="space-y-4">
          <Card className="opacity-60 grayscale border-dashed">
            <CardHeader>
              <CardTitle>Distribución por Edad y Género</CardTitle>
              <CardDescription>Participación electoral segmentada <span className="font-semibold text-muted-foreground">(Datos de ejemplo)</span></CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={demographicDetailData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hombres" fill="#3b82f6" name="Hombres" />
                  <Bar dataKey="mujeres" fill="#ec4899" name="Mujeres" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function GraficosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full p-6 text-muted-foreground">Cargando gráficos...</div>}>
      <GraficosContent />
    </Suspense>
  )
}