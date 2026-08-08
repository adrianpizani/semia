// hooks/use-map-view.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { getMunicipiosGeoJSON, getCircuitosGeoJSON } from '@/lib/api';
import { DomEvent } from 'leaflet';
import { DistritoFeature, DistritoProperties, ElectoralData } from '@/lib/types'; // Importar tipos comunes

// --- Paleta de Colores y Estilos ---
const partyColorPalette: { [key: string]: string } = {
  'JUNTOS POR EL CAMBIO': '#FFD700',
  'FRENTE DE TODOS': '#1E90FF',
  'CONSENSO FEDERAL': '#FFA500',
  'FRENTE DE IZQUIERDA Y DE TRABAJADORES - UNIDAD': '#FF0000',
  'UNIDAD CIUDADANA': '#87CEEB',
  'CAMBIEMOS BUENOS AIRES': '#FFC0CB',
  '1PAIS': '#9370DB',
  'FRENTE JUSTICIALISTA': '#00008B',
  'FRENTE DE IZQUIERDA Y DE LOS TRABAJadores': '#DC143C',
  'JUNTOS': '#FFD700',
  'default': '#D1D5DB'
};

const getPartyColor = (partyName: string | null | undefined): string => {
  if (!partyName) return partyColorPalette.default;
  return partyColorPalette[partyName] || partyColorPalette.default;
};

// Normaliza un nombre geográfico para hacer match robusto
// (sin acentos, minúsculas, sin espacios sobrantes).
// Ej: "General Pueyrredón" === "General Pueyrredon" === "general pueyrredon"
const normalizeGeoName = (name: string | null | undefined): string => {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
};

// --- Hook Principal ---
export const useMapView = (
  selectedMetric: number | null,
  electoralData: ElectoralData[] | null,
  onMunicipioClick: (municipio: DistritoFeature) => void,
  onCircuitoClick: (circuito: DistritoFeature) => void,
  selectedMunicipio: DistritoFeature | null,
  selectedCircuito: DistritoFeature | null,
) => {
  const [municipiosGeoJSON, setMunicipiosGeoJSON] = useState<FeatureCollection | null>(null);
  const [circuitosGeoJSON, setCircuitosGeoJSON] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | number | null>(null);
  const [hoveredCircuitoId, setHoveredCircuitoId] = useState<string | number | null>(null);

  const onMunicipioClickRef = useRef(onMunicipioClick);
  useEffect(() => {
    onMunicipioClickRef.current = onMunicipioClick;
  }, [onMunicipioClick]);

  const onCircuitoClickRef = useRef(onCircuitoClick);
  useEffect(() => {
    onCircuitoClickRef.current = onCircuitoClick;
  }, [onCircuitoClick]);

  useEffect(() => {
    const loadMapData = async () => {
      try {
        setIsLoading(true);
        const [municipiosData, circuitosData] = await Promise.all([
          getMunicipiosGeoJSON(),
          getCircuitosGeoJSON()
        ]);
        setMunicipiosGeoJSON(municipiosData);
        setCircuitosGeoJSON(circuitosData);
      } catch (error) {
        console.error("Error cargando datos geoespaciales:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadMapData();
  }, []);

  const getStyleMunicipio = useCallback((feature?: DistritoFeature): PathOptions => {
    const baseStyle: PathOptions = { 
      weight: 2,
      opacity: 1, 
      color: 'black', 
      fillOpacity: 0.65 
    };
    let fillColor = partyColorPalette.default;
    if (feature && electoralData) {
      const districtData = electoralData.find(d => d.geografia_id === feature.id);
      if (districtData && districtData.ganador) {
        fillColor = getPartyColor(districtData.ganador.partido);
      } 
    }
    baseStyle.fillColor = fillColor;
    if (feature && feature.id === hoveredId) {
      return { ...baseStyle, weight: 4, color: '#333', fillOpacity: 0.8 };
    }
    return baseStyle;
  }, [hoveredId, electoralData]);

  const styleCircuito = useCallback((feature?: DistritoFeature): PathOptions => {
    const circuitParentId = feature?.properties?.parent_id;
    // Nombre del municipio padre (presente en el GeoJSON de importación original,
    // pero NO en el que expone la API; se deja como fallback por robustez).
    const circuitParentName = (feature?.properties as unknown as { departamen?: string })?.departamen;
    const selectedMunicipioName = selectedMunicipio?.properties?.nombre;
    const matchesSelectedMunicipio =
      !!selectedMunicipio &&
      (
        // Match principal por id del municipio padre (lo que devuelve la API).
        (circuitParentId != null && circuitParentId === selectedMunicipio.id) ||
        // Fallback por nombre normalizado (sin acentos / mayúsculas).
        (!!circuitParentName && !!selectedMunicipioName && normalizeGeoName(circuitParentName) === normalizeGeoName(selectedMunicipioName))
      );

    const isSelected = !!selectedCircuito && feature?.id === selectedCircuito.id;
    const isHovered = !!feature && feature.id === hoveredCircuitoId;

    if (isSelected) {
      return {
        weight: 3,
        opacity: 1,
        color: '#1d4ed8', // azul fuerte para el circuito elegido
        fillOpacity: 0.35,
      };
    }

    if (isHovered) {
      return {
        weight: 2,
        opacity: 1,
        color: '#2563eb',
        fillOpacity: 0.2,
      };
    }

    if (selectedMunicipio) {
      // Hay municipio seleccionado: resalta los del municipio y atenúa el resto.
      return matchesSelectedMunicipio
        ? {
            weight: 2,
            opacity: 1,
            color: '#e60000',
            fillOpacity: 0.25,
          }
        : {
            weight: 0.5,
            opacity: 0.4,
            color: '#666',
            fillOpacity: 0.05,
          };
    }

    // Sin municipio seleccionado: overlay tenue de circuitos como capa informativa.
    return {
      weight: 0.5,
      opacity: 0.5,
      color: '#666',
      fillOpacity: 0.05,
    };
  }, [selectedMunicipio, selectedCircuito, hoveredCircuitoId]);

  const onEachFeatureMunicipio = useCallback((feature: DistritoFeature, layer: Layer) => {
    layer.bindTooltip(feature.properties.nombre, { sticky: true, className: 'custom-tooltip' });
    layer.on({
      mouseover: () => setHoveredId(feature.id != null ? feature.id : null),
      mouseout: () => setHoveredId(null),
      click: (e) => {
        console.log("[DEBUG][hook] Se ejecuta el click del MUNICIPIO:", feature?.properties?.nombre, "| id:", feature?.id);
        if (e && e.originalEvent) {
          DomEvent.stopPropagation(e.originalEvent);
        }
        onMunicipioClickRef.current(feature);
        if (electoralData) {
          const districtData = electoralData.find(d => d.geografia_id === feature.id);
          if (districtData) {
            const resultsHtml = districtData.resultados
              .map(r => `<li><strong>${r.partido}:</strong> ${r.votos.toLocaleString('es-AR')} votos</li>`)
              .join('');
            const popupContent = `<div class="font-sans"><h3 class="font-bold text-lg mb-2">${districtData.nombre}</h3><ul class="list-disc pl-5">${resultsHtml}</ul></div>`;
            layer.bindPopup(popupContent).openPopup();
          }
        }
      },
    });
  }, [electoralData]);

  // --- NUEVA LOGICA PARA CIRCUITOS ---
  const onEachFeatureCircuito = useCallback((feature: DistritoFeature, layer: Layer) => {
    if (layer.options) (layer.options as { interactive?: boolean }).interactive = true;

    const circuitParentId = feature.properties.parent_id;
    const circuitParentName = (feature.properties as unknown as { departamen?: string })?.departamen;
    const selectedMunicipioName = selectedMunicipio?.properties?.nombre;
    const matchesSelectedMunicipio =
      !!selectedMunicipio &&
      (
        (circuitParentId != null && circuitParentId === selectedMunicipio.id) ||
        (!!circuitParentName && !!selectedMunicipioName && normalizeGeoName(circuitParentName) === normalizeGeoName(selectedMunicipioName))
      );

    const isSelected = !!selectedCircuito && feature.id === selectedCircuito.id;

    const className = [
      'custom-tooltip-circuito',
      isSelected && 'custom-tooltip-circuito--selected',
      matchesSelectedMunicipio && 'custom-tooltip-circuito--highlighted',
    ].filter(Boolean).join(' ');

    layer.bindTooltip(feature.properties.nombre, {
      sticky: true,
      className,
    });

    layer.off(); // Limpia handlers previos antes de re-asignar (por re-mount vía key).
    layer.on({
      mouseover: () => setHoveredCircuitoId(feature.id != null ? feature.id : null),
      mouseout: () => setHoveredCircuitoId(null),
      click: (e) => {
        // Evita que el click del circuito se propague a la capa de municipios de abajo
        // (junto con bubblingMouseEvents={false}).
        if (e && e.originalEvent) {
          DomEvent.stopPropagation(e.originalEvent);
        }
        console.log("[DEBUG][hook] Se ejecuta el click del CIRCUITO:", feature?.properties?.nombre, "| id:", feature?.id);
        onCircuitoClickRef.current(feature);
      },
    });
  }, [selectedMunicipio, selectedCircuito]);

  return {
    municipiosGeoJSON,
    circuitosGeoJSON,
    isLoading: isLoading || !municipiosGeoJSON,
    getStyleMunicipio,
    styleCircuito,
    onEachFeatureMunicipio,
    onEachFeatureCircuito,
  };
};