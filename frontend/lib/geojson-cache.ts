import type { FeatureCollection } from 'geojson';
import { getCircuitosGeoJSON, getMunicipiosGeoJSON, getProvinciasGeoJSON } from '@/lib/api';

// Cache de sesión en memoria: el GeoJSON no cambia al navegar Archivos/Métricas.

let municipiosCache: FeatureCollection | null = null;
let municipiosPending: Promise<FeatureCollection> | null = null;

let provinciasCache: FeatureCollection | null = null;
let provinciasPending: Promise<FeatureCollection> | null = null;

let circuitosCache: FeatureCollection | null = null;
let circuitosPending: Promise<FeatureCollection> | null = null;

export function loadMunicipiosGeoJSONCached(): Promise<FeatureCollection> {
  if (municipiosCache) return Promise.resolve(municipiosCache);
  if (!municipiosPending) {
    municipiosPending = getMunicipiosGeoJSON()
      .then((data) => {
        municipiosCache = data;
        return data;
      })
      .catch((error) => {
        municipiosPending = null;
        throw error;
      });
  }
  return municipiosPending;
}

export function loadProvinciasGeoJSONCached(): Promise<FeatureCollection> {
  if (provinciasCache) return Promise.resolve(provinciasCache);
  if (!provinciasPending) {
    provinciasPending = getProvinciasGeoJSON()
      .then((data) => {
        provinciasCache = data;
        return data;
      })
      .catch((error) => {
        provinciasPending = null;
        throw error;
      });
  }
  return provinciasPending;
}

export function loadCircuitosGeoJSONCached(): Promise<FeatureCollection> {
  if (circuitosCache) return Promise.resolve(circuitosCache);
  if (!circuitosPending) {
    circuitosPending = getCircuitosGeoJSON()
      .then((data) => {
        circuitosCache = data;
        return data;
      })
      .catch((error) => {
        circuitosPending = null;
        throw error;
      });
  }
  return circuitosPending;
}
