import { MapContainer, GeoJSON, TileLayer, LayersControl } from 'react-leaflet';
import { useMapView } from '@/hooks/use-map-view';
import { useMemo } from 'react';
import type { LatLngExpression } from 'leaflet';
import { DistritoFeature } from '@/lib/types'; // Importar tipo común
import { PartyLegend } from '@/components/party-legend';

// --- Tipos de Datos ---
interface MapViewClientProps {
  selectedMetric: number | null;
  electoralData: any[] | null;
  onMunicipioClick: (municipio: DistritoFeature) => void;
  onCircuitoClick?: (circuito: DistritoFeature) => void;
  isLoading: boolean;
  selectedMunicipio: DistritoFeature | null;
  selectedCircuito?: DistritoFeature | null;
}

// --- Componente Principal del Mapa ---
export default function MapViewClient({
  selectedMetric,
  electoralData,
  onMunicipioClick,
  onCircuitoClick = () => {},
  isLoading: isDataLoading,
  selectedMunicipio,
  selectedCircuito = null,
}: MapViewClientProps) {
  const {
    municipiosGeoJSON,
    circuitosGeoJSON,
    isLoading: isGeoJsonLoading,
    getStyleMunicipio,
    styleCircuito,
    onEachFeatureMunicipio,
    onEachFeatureCircuito,
  } = useMapView(
    selectedMetric,
    electoralData,
    onMunicipioClick,
    onCircuitoClick,
    selectedMunicipio,
    selectedCircuito,
  );

  const position: LatLngExpression = [-37.0, -60.0];
  const zoom = 7;

  const showLoading = isDataLoading || isGeoJsonLoading;

  // Partidos presentes en los datos electorales actuales (para la leyenda).
  const legendParties = useMemo(() => {
    if (!electoralData) return [];
    const set = new Set<string>();
    electoralData.forEach((d: any) => {
      d?.resultados?.forEach((r: any) => set.add(r.partido));
    });
    return Array.from(set).sort();
  }, [electoralData]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={position}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Municipios">
            {municipiosGeoJSON && (
              <GeoJSON
                key={selectedMetric ? `metric-${selectedMetric}` : 'no-metric'}
                data={municipiosGeoJSON}
                style={getStyleMunicipio}
                onEachFeature={onEachFeatureMunicipio}
              />
            )}
          </LayersControl.BaseLayer>

          <LayersControl.Overlay name="Circuitos Electorales">
            {circuitosGeoJSON && (
              <GeoJSON
                data={circuitosGeoJSON}
                style={styleCircuito}
                onEachFeature={onEachFeatureCircuito}
                // Evita que el click sobre un circuito "burbujee" hacia la capa de
                // municipios de abajo y des-seleccione la jerarquía superior.
                bubblingMouseEvents={false}
              />
            )}
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {!showLoading && legendParties.length > 0 && (
        <PartyLegend parties={legendParties} />
      )}

      {showLoading && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-[1000]">
          <div className="text-center">
            <svg className="animate-spin h-8 w-8 text-gray-600 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-700 font-medium">Cargando datos del mapa...</p>
          </div>
        </div>
      )}
    </div>
  );
}

