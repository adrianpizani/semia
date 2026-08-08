"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

// --- Tipos ---
interface SelectionData {
  geografia_id: number;
  nombre: string;
  resultados: { partido: string; votos: number }[];
  ganador: { partido: string; votos: number } | null;
}

interface DashboardChartsProps {
  selectionData: SelectionData | null;
}

// Muestra la distribución de votos por partido para el municipio seleccionado.
// Solo se renderiza si hay selectionData; si no, no muestra nada.
export function DashboardCharts({ selectionData }: DashboardChartsProps) {
  if (!selectionData) return null;

  const chartTitle = `Distribución de Votos - ${selectionData.nombre}`;
  const partyVotesData = selectionData.resultados.map(r => ({
    party: r.partido,
    votes: r.votos,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{chartTitle}</CardTitle>
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
  );
}