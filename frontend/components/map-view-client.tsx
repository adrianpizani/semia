import { MapContainer, GeoJSON, TileLayer, LayersControl, LayerGroup, useMapEvents, useMap } from 'react-leaflet';
import { useMapView } from '@/hooks/use-map-view';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import type { FeatureCollection } from 'geojson';
import L, { type LatLngExpression } from 'leaflet';
import { DistritoFeature, MunicipioTooltipSecondaries } from '@/lib/types'; // Importar tipo común
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
  highlightParty?: string | null;
  secondaryByGeo?: MunicipioTooltipSecondaries;
}

const PBA_CENTER: LatLngExpression = [-37.0, -60.0];
const PBA_ZOOM = 7;

function CircuitosOverlayListener({ onEnable }: { onEnable: () => void }) {
  useMapEvents({
    overlayadd(e) {
      if (e.name === 'Circuitos Electorales') onEnable();
    },
  });
  return null;
}

function FocusSelectedMunicipio({
  selectedMunicipio,
  municipiosGeoJSON,
}: {
  selectedMunicipio: DistritoFeature | null;
  municipiosGeoJSON: FeatureCollection | null;
}) {
  const map = useMap();
  const hadSelection = useRef(false);
  const selectedId = selectedMunicipio?.id ?? null;

  useEffect(() => {
    if (selectedId == null) {
      if (hadSelection.current) {
        map.flyTo(PBA_CENTER, PBA_ZOOM, { duration: 0.55 });
        hadSelection.current = false;
      }
      return;
    }
    hadSelection.current = true;
    const feature =
      municipiosGeoJSON?.features.find(f => f.id == selectedId)
      ?? (selectedMunicipio?.geometry ? selectedMunicipio : null);
    if (!feature?.geometry) return;
    const temp = L.geoJSON(feature);
    const bounds = temp.getBounds();
    if (!bounds.isValid()) return;
    map.flyToBounds(bounds, {
      padding: [120, 120],
      maxZoom: 8,
      duration: 0.55,
    });
  }, [selectedId, map, municipiosGeoJSON, selectedMunicipio]);

  return null;
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
  highlightParty = null,
  secondaryByGeo = {},
}: MapViewClientProps) {
  const {
    municipiosGeoJSON,
    circuitosGeoJSON,
    isLoading: isGeoJsonLoading,
    getStyleMunicipio,
    styleCircuito,
    onEachFeatureMunicipio,
    onEachFeatureCircuito,
    loadCircuitos,
    intensityDomain,
  } = useMapView(
    selectedMetric,
    electoralData,
    onMunicipioClick,
    onCircuitoClick,
    selectedMunicipio,
    selectedCircuito,
    highlightParty,
    secondaryByGeo,
  );

  const handleEnableCircuitos = useCallback(() => {
    void loadCircuitos();
  }, [loadCircuitos]);

  const municipiosRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const layer = municipiosRef.current;
    if (!layer) return;
    layer.setStyle(getStyleMunicipio);
    if (!selectedMunicipio) return;
    layer.eachLayer((path) => {
      const id = (path as L.Layer & { feature?: { id?: string | number } }).feature?.id;
      if (id == selectedMunicipio.id && 'bringToFront' in path) {
        (path as L.Path).bringToFront();
      }
    });
  }, [getStyleMunicipio, selectedMunicipio]);

  const position: LatLngExpression = PBA_CENTER;
  const zoom = PBA_ZOOM;

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
        <CircuitosOverlayListener onEnable={handleEnableCircuitos} />
        <FocusSelectedMunicipio
          selectedMunicipio={selectedMunicipio}
          municipiosGeoJSON={municipiosGeoJSON}
        />
        
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Municipios">
            {municipiosGeoJSON && (
              <GeoJSON
                ref={municipiosRef}
                key={selectedMetric ? `metric-${selectedMetric}-${highlightParty ?? 'ganador'}` : 'no-metric'}
                data={municipiosGeoJSON}
                style={getStyleMunicipio}
                onEachFeature={onEachFeatureMunicipio}
              />
            )}
          </LayersControl.BaseLayer>

          <LayersControl.Overlay name="Circuitos Electorales">
            <LayerGroup>
              {circuitosGeoJSON && (
                <GeoJSON
                  data={circuitosGeoJSON}
                  style={styleCircuito}
                  onEachFeature={onEachFeatureCircuito}
                  bubblingMouseEvents={false}
                />
              )}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {!showLoading && legendParties.length > 0 && (
        <PartyLegend parties={legendParties} highlightParty={highlightParty} intensityDomain={intensityDomain} />
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

