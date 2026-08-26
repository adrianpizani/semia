// hooks/use-map-view.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { loadCircuitosGeoJSONCached, loadMunicipiosGeoJSONCached } from '@/lib/geojson-cache';
import { DomEvent } from 'leaflet';
import { DistritoFeature, DistritoProperties, ElectoralData, MunicipioTooltipSecondaries } from '@/lib/types'; // Importar tipos comunes
import { getIntensityOpacity, getPartyColor, getPartyVoteShare, getShareDomain, IntensityDomain } from '@/lib/party-color';
import { formatCompact } from '@/lib/range-utils';

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

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function municipioTooltipHtml(
  feature: DistritoFeature,
  electoralData: ElectoralData[] | null,
  highlightParty: string | null,
  secondaryByGeo: MunicipioTooltipSecondaries,
): string {
  const name = feature.properties.nombre;
  const lines = [`<div class="font-semibold">${escapeHtml(name)}</div>`];
  const district = electoralData?.find(d => d.geografia_id == feature.id);
  if (district) {
    const party = highlightParty ?? district.ganador?.partido ?? null;
    if (party) {
      const pct = (getPartyVoteShare(district.resultados, party) * 100).toFixed(1).replace('.', ',');
      const short = party.length > 32 ? `${party.slice(0, 30)}…` : party;
      lines.push(`<div>${escapeHtml(short)} ${pct}%</div>`);
    }
  }
  const extras = secondaryByGeo[Number(feature.id)] ?? [];
  for (const extra of extras) {
    lines.push(`<div>${escapeHtml(extra.nombre)} ${formatCompact(extra.valor)}</div>`);
  }
  return `<div class="font-sans text-xs leading-snug">${lines.join('')}</div>`;
}

// --- Hook Principal ---
export const useMapView = (
  selectedMetric: number | null,
  electoralData: ElectoralData[] | null,
  onMunicipioClick: (municipio: DistritoFeature) => void,
  onCircuitoClick: (circuito: DistritoFeature) => void,
  selectedMunicipio: DistritoFeature | null,
  selectedCircuito: DistritoFeature | null,
  highlightParty: string | null = null,
  secondaryByGeo: MunicipioTooltipSecondaries = {},
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

  const tooltipCtxRef = useRef({ electoralData, highlightParty, secondaryByGeo });
  useEffect(() => {
    tooltipCtxRef.current = { electoralData, highlightParty, secondaryByGeo };
  }, [electoralData, highlightParty, secondaryByGeo]);

  const intensityDomain: IntensityDomain = useMemo(() => {
    if (!highlightParty || !electoralData?.length) return { min: 0, max: 1 };
    const shares = electoralData.map(d => getPartyVoteShare(d.resultados, highlightParty));
    return getShareDomain(shares);
  }, [electoralData, highlightParty]);

  useEffect(() => {
    const loadMapData = async () => {
      try {
        setIsLoading(true);
        const municipiosData = await loadMunicipiosGeoJSONCached();
        setMunicipiosGeoJSON(municipiosData);
      } catch (error) {
        console.error("Error cargando datos geoespaciales:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadMapData();
  }, []);

  const loadCircuitos = useCallback(async () => {
    if (circuitosGeoJSON) return;
    try {
      const circuitosData = await loadCircuitosGeoJSONCached();
      setCircuitosGeoJSON(circuitosData);
    } catch (error) {
      console.error("Error cargando circuitos electorales:", error);
    }
  }, [circuitosGeoJSON]);

  const getStyleMunicipio = useCallback((feature?: DistritoFeature): PathOptions => {
    const baseStyle: PathOptions = {
      weight: 2,
      opacity: 1,
      color: 'black',
      fillOpacity: 0.65,
      // Habilita la transición CSS de fill/fill-opacity al cambiar filtros.
      // Hover/selected usa la variante --instant para feedback inmediato.
      className: 'semia-municipio',
    };
    let fillColor = getPartyColor(null);
    if (feature && electoralData) {
      const districtData = electoralData.find(d => d.geografia_id === feature.id);
      if (highlightParty) {
        // Modo intensidad: color del partido, opacidad relativa al rango observado.
        const share = getPartyVoteShare(districtData?.resultados, highlightParty);
        fillColor = getPartyColor(highlightParty);
        baseStyle.fillOpacity = getIntensityOpacity(share, intensityDomain);
      } else if (districtData && districtData.ganador) {
        fillColor = getPartyColor(districtData.ganador.partido);
      }
    }
    baseStyle.fillColor = fillColor;
    const isSelected = !!(feature && selectedMunicipio && feature.id == selectedMunicipio.id);
    const isHovered = !!(feature && feature.id === hoveredId);
    if (isSelected) {
      return {
        ...baseStyle,
        weight: 4,
        color: '#22d3ee',
        fillOpacity: Math.min(1, (baseStyle.fillOpacity ?? 0.65) + 0.08),
        className: 'semia-municipio semia-municipio--instant',
      };
    }
    if (isHovered) {
      return {
        ...baseStyle,
        weight: 4,
        color: '#333',
        fillOpacity: Math.min(1, (baseStyle.fillOpacity ?? 0.65) + 0.12),
        className: 'semia-municipio semia-municipio--instant',
      };
    }
    return baseStyle;
  }, [hoveredId, electoralData, highlightParty, selectedMunicipio, intensityDomain]);

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
      mouseover: () => {
        const ctx = tooltipCtxRef.current;
        layer.setTooltipContent(municipioTooltipHtml(
          feature,
          ctx.electoralData,
          ctx.highlightParty,
          ctx.secondaryByGeo,
        ));
        setHoveredId(feature.id != null ? feature.id : null);
      },
      mouseout: () => setHoveredId(null),
      click: (e) => {
        if (e && e.originalEvent) {
          DomEvent.stopPropagation(e.originalEvent);
        }
        onMunicipioClickRef.current(feature);
      },
    });
  }, []);

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
    loadCircuitos,
    intensityDomain,
  };
};