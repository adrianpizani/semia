'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { DashboardCharts } from "@/components/dashboard-charts";
import { getElectoralData } from '@/lib/api';
import { DistritoFeature, ElectoralData } from '@/lib/types'; // Importar tipos comunes

const MapViewClient = dynamic(() => import('@/components/map-view-client'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100"><p>Cargando mapa...</p></div>,
});

export default function MapaElectoralPage() {
  // Este es ahora el ÚNICO lugar donde vive el estado de la página.
  const [selectedMetric, setSelectedMetric] = useState<number | null>(1); // Temporalmente en 1 para pruebas
  const [selectedMunicipio, setSelectedMunicipio] = useState<DistritoFeature | null>(null);
  const [electoralData, setElectoralData] = useState<ElectoralData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Carga los datos electorales cuando cambia la métrica
  useEffect(() => {
    if (selectedMetric === null) {
      setElectoralData(null);
      return;
    }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await getElectoralData(selectedMetric);
        setElectoralData(data);
      } catch (error) {
        console.error("Error al cargar datos electorales:", error);
        setElectoralData(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedMetric]);

  // Manejador de clic que actualiza el municipio seleccionado
  const handleMunicipioClick = (municipio: DistritoFeature) => {
    console.log("[DEBUG] handleMunicipioClick en MapaElectoralPage. Se recibió:", municipio);
    if (selectedMunicipio && selectedMunicipio.id === municipio.id) {
      setSelectedMunicipio(null);
    } else {
      setSelectedMunicipio(municipio);
    }
  };

  // Encuentra los datos específicos para el municipio seleccionado
  const selectedMunicipioData = electoralData && selectedMunicipio
    ? electoralData.find(d => d.geografia_id === selectedMunicipio.id) || null
    : null;

  console.log("1. MapaElectoralPage - selectedMunicipio:", selectedMunicipio); // <-- LOG DE DEPURACIÓN

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        {/* MapView ahora recibe todo como props */}
        <MapViewClient
          selectedMetric={selectedMetric}
          electoralData={electoralData}
          onMunicipioClick={handleMunicipioClick}
          isLoading={isLoading}
          selectedMunicipio={selectedMunicipio ? { ...selectedMunicipio } : null} // Pasamos una nueva referencia de objeto
        />
      </div>

      <div className="border-t">
        {/* DashboardCharts ahora recibe los datos del municipio seleccionado y la métrica actual */}
        <DashboardCharts selectionData={selectedMunicipioData} selectedMetricId={selectedMetric} />
      </div>
    </div>
  );
}

