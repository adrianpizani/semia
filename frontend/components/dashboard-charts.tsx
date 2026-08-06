"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Users, Vote, BarChartIcon, ChevronDown, FileText } from "lucide-react"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

// --- Tipos ---
interface SelectionData {
  geografia_id: number;
  nombre: string;
  resultados: { partido: string; votos: number }[];
  ganador: { partido: string; votos: number } | null;
}

interface DashboardChartsProps {
  selectionData: SelectionData | null;
  selectedMetricId?: number | null;
  selectedMetricId2?: number | null;
}

// --- Datos Estáticos de Ejemplo (se usan si no hay selección) ---
const participationData = [
  { year: "2019", participation: 62 },
  { year: "2021", participation: 63 },
  { year: "2023", participation: 68.4 },
]

const defaultPartyVotesData = [
  { party: "Partido A", votes: 4500 },
  { party: "Partido B", votes: 5200 },
  { party: "Partido C", votes: 3800 },
]

export function DashboardCharts({ selectionData, selectedMetricId, selectedMetricId2 }: DashboardChartsProps) {
  const [isExpanded, setIsExpanded] = useState(true) // Dejar expandido por defecto
  const router = useRouter()

  // --- Lógica de Datos Dinámicos ---
  const chartTitle = selectionData 
    ? `Distribución de Votos - ${selectionData.nombre}` 
    : "Distribución de Votos (General)";
  
  const partyVotesData = selectionData 
    ? selectionData.resultados.map(r => ({ party: r.partido, votes: r.votos }))
    : defaultPartyVotesData;

  const handleReportClick = () => {
    if (selectionData) {
      const query = new URLSearchParams();
      query.append("geografia_id", selectionData.geografia_id.toString());
      if (selectedMetricId) {
        query.append("metrica_1", selectedMetricId.toString());
      }
      if (selectedMetricId2) {
        query.append("metrica_2", selectedMetricId2.toString());
      } else {
        // Temporal para demostración del cruce: si no hay métrica 2 en el mapa, enviamos la métrica 2 (socioeconómica) por defecto
        query.append("metrica_2", "2"); 
      }
      router.push(`/graficos?${query.toString()}`);
    }
  };

  return (
    <div className="space-y-4 p-6">
      {/* Stats Cards (siguen siendo estáticos por ahora) */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* ... (código de las 4 tarjetas de estadísticas) ... */}
      </div>

      {/* Toggle Button y Botón de Reportar */}
      <div className="flex justify-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="gap-2">
          {isExpanded ? "Ocultar" : "Ver"} Gráficos Detallados
          <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
        </Button>
        {selectionData && (
          <Button variant="default" size="sm" onClick={handleReportClick} className="gap-2">
            <FileText className="h-4 w-4" />
            Reportar Municipio
          </Button>
        )}
      </div>

      {/* Detailed Charts */}
      {isExpanded && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Party Votes (AHORA DINÁMICO) */}
          <Card>
            <CardHeader>
              <CardTitle>{chartTitle}</CardTitle>
              <CardDescription>Resultados para la selección actual</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={partyVotesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="party" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => value.toLocaleString('es-AR')} />
                  <Legend />
                  <Bar dataKey="votes" fill="#3b82f6" name="Votos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Participation Trend (sigue estático) */}
          <Card>
            <CardHeader>
              <CardTitle>Tendencia de Participación</CardTitle>
              <CardDescription>Evolución de la participación electoral por año</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={participationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="participation" stroke="#3b82f6" name="Participación %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
