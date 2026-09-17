import { MapContainer, GeoJSON, TileLayer, LayersControl, LayerGroup, useMapEvents, useMap } from 'react-leaflet';
import { useMapView, type MapModo } from '@/hooks/use-map-view';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import type { FeatureCollection } from 'geojson';
import L, { type LatLngExpression } from 'leaflet';
import { DistritoFeature, GenericData, Metrica, MunicipioTooltipSecondaries } from '@/lib/types';
import { PartyLegend } from '@/components/party-legend';
import { PrensaHotspotsLayer } from '@/components/prensa-hotspots-layer';

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
  hotspotMetrics?: Metrica[];
  hotspotDataByMetric?: Record<number, GenericData[]>;
  onHotspotSelect?: (geografiaId: number, nombre: string) => void;
  mapMode?: MapModo;
}

const PBA_CENTER: LatLngExpression = [-37.0, -60.0];
const PBA_ZOOM = 7;
const ARG_CENTER: LatLngExpression = [-38.5, -63.5];
const ARG_ZOOM = 4;

function CircuitosOverlayListener({ onEnable }: { onEnable: () => void }) {
  useMapEvents({
    overlayadd(e) {
      if (e.name === 'Circuitos Electorales') onEnable();
    },
  });
  return null;
}

function MapModeCamera({ mapMode }: { mapMode: MapModo }) {
  const map = useMap();
  const prevMode = useRef(mapMode);

  useEffect(() => {
    if (prevMode.current === mapMode) return;
    prevMode.current = mapMode;
    const center = mapMode === 'nacional' ? ARG_CENTER : PBA_CENTER;
    const zoom = mapMode === 'nacional' ? ARG_ZOOM : PBA_ZOOM;
    map.flyTo(center, zoom, { duration: 0.6 });
  }, [mapMode, map]);

  return null;
}

function FocusSelectedMunicipio({
  selectedMunicipio,
  municipiosGeoJSON,
  mapMode,
}: {
  selectedMunicipio: DistritoFeature | null;
  municipiosGeoJSON: FeatureCollection | null;
  mapMode: MapModo;
}) {
  const map = useMap();
  const hadSelection = useRef(false);
  const selectedId = selectedMunicipio?.id ?? null;
  const defaultCenter = mapMode === 'nacional' ? ARG_CENTER : PBA_CENTER;
  const defaultZoom = mapMode === 'nacional' ? ARG_ZOOM : PBA_ZOOM;

  useEffect(() => {
    if (selectedId == null) {
      if (hadSelection.current) {
        map.flyTo(defaultCenter, defaultZoom, { duration: 0.55 });
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
      maxZoom: mapMode === 'nacional' ? 6 : 8,
      duration: 0.55,
    });
  }, [selectedId, map, municipiosGeoJSON, selectedMunicipio, defaultCenter, defaultZoom, mapMode]);

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
  hotspotMetrics = [],
  hotspotDataByMetric = {},
  onHotspotSelect,
  mapMode = 'pba',
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
    mapMode,
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

  const position: LatLngExpression = mapMode === 'nacional' ? ARG_CENTER : PBA_CENTER;
  const zoom = mapMode === 'nacional' ? ARG_ZOOM : PBA_ZOOM;
  const baseLayerName = mapMode === 'nacional' ? 'Provincias' : 'Municipios';

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
        <MapModeCamera mapMode={mapMode} />
        {mapMode === 'pba' && <CircuitosOverlayListener onEnable={handleEnableCircuitos} />}
        <FocusSelectedMunicipio
          selectedMunicipio={selectedMunicipio}
          municipiosGeoJSON={municipiosGeoJSON}
          mapMode={mapMode}
        />
        
        <LayersControl position="topright" key={mapMode}>
          <LayersControl.BaseLayer checked name={baseLayerName}>
            {municipiosGeoJSON && (
              <GeoJSON
                ref={municipiosRef}
                key={`${mapMode}-${selectedMetric ? `metric-${selectedMetric}-${highlightParty ?? 'ganador'}` : 'no-metric'}`}
                data={municipiosGeoJSON}
                style={getStyleMunicipio}
                onEachFeature={onEachFeatureMunicipio}
              />
            )}
          </LayersControl.BaseLayer>

          {mapMode === 'pba' && (
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
          )}
        </LayersControl>

        {hotspotMetrics.length > 0 && (
          <PrensaHotspotsLayer
            municipiosGeoJSON={municipiosGeoJSON}
            metrics={hotspotMetrics}
            dataByMetric={hotspotDataByMetric}
            selectedGeografiaId={selectedMunicipio?.id != null ? Number(selectedMunicipio.id) : null}
            onSelect={onHotspotSelect}
          />
        )}
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
