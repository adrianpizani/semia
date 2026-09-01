// Helper to determine the base URL for API calls
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Browser: same origin (Next rewrites or nginx /api → backend).
    return '';
  }
  // Server (RSC): hablar directo al backend. En Docker es http://backend:8000.
  return process.env.BACKEND_URL || 'http://localhost:8000';
};

const API_BASE_URL = `${getBaseUrl()}/api/v1`;

/** Extrae mensaje legible de respuestas de error FastAPI (detail string o lista de validación). */
export function extractApiError(data: unknown, fallback = 'Error en la solicitud'): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg);
        return JSON.stringify(item);
      })
      .join('; ');
  }
  return fallback;
}

async function throwIfNotOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const errorData = await response.json().catch(() => ({}));
  throw new Error(extractApiError(errorData, fallback));
}

async function cookieHeaderForServer(): Promise<string> {
  if (typeof window !== 'undefined') return '';
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    return store.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = await cookieHeaderForServer();
  if (cookie && !headers.has('Cookie')) {
    headers.set('Cookie', cookie);
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: init.cache ?? 'no-store',
  });
}

export const getMunicipiosGeoJSON = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/geografia/municipios/geojson`);
    if (!response.ok) {
      throw new Error('Network response was not ok for Municipios GeoJSON');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Municipios GeoJSON:', error);
    throw error;
  }
};

export const getCircuitosGeoJSON = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/geografia/circuitos/geojson`);
    if (!response.ok) {
      throw new Error('Network response was not ok for Circuitos GeoJSON');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Circuitos GeoJSON:', error);
    throw error;
  }
};

export const getArchivos = async () => {
  try {
    const response = await apiFetch('/archivos');
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch {
    return [];
  }
};

export const uploadArchivo = async (formData: FormData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/archivos`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to upload file');
    }
    return await response.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

export const getGeoData = async (archivoIds: number[], agregacion: 'sum' | 'avg' = 'sum') => {
  try {
    const response = await fetch(`${API_BASE_URL}/geografia/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        archivo_ids: archivoIds,
        agregacion: agregacion,
      }),
    });
    if (!response.ok) {
      throw new Error('Network response was not ok for GeoData');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching GeoData:', error);
    throw error;
  }
};

export const getMetricas = async () => {
  try {
    const response = await apiFetch('/metricas');
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch {
    return [];
  }
};

export const toggleMetrica = async (metricId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/toggle`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to toggle metric');
    }
    return await response.json();
  } catch (error) {
    console.error('Error toggling metric:', error);
    throw error;
  }
};

export const updateMetricaEscala = async (
  metricId: number,
  escala_rango: 'log' | 'linear' | null,
) => {
  const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/escala-rango`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ escala_rango }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update metric scale');
  }
  return await response.json();
};

export const deleteArchivo = async (archivoId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/archivos/${archivoId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})); // Intenta parsear JSON, si falla, devuelve objeto vacío
      throw new Error(errorData.detail || 'Failed to delete file');
    }
    // No se espera contenido en una respuesta 204, así que no se parsea JSON
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

import { AnyFiltro, MetricaOpciones, Usuario } from './types';

// ... (other functions remain the same) ...

export const getElectoralData = async (metricId: number, filtros?: AnyFiltro[]) => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filtros: filtros || null }),
      cache: 'no-store'
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Network response was not ok for Electoral Data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching electoral data:', error);
    throw error;
  }
};

export const getGenericMetricData = async (metricId: number, filtros?: AnyFiltro[]) => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/datos-genericos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filtros: filtros || null }),
      cache: 'no-store'
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Network response was not ok for Generic Metric Data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching generic metric data:', error);
    throw error;
  }
};

export const getMetricOpciones = async (metricId: number): Promise<MetricaOpciones> => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/opciones`, { cache: 'no-store' });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Network response was not ok for Metric Opciones');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching metric opciones:', error);
    return { partidos: [], años: [], votos_tipos: [] };
  }
};

export interface SeriePunto {
  anio: string
  partido: string
  votos: number
}

export const getSerieHistorica = async (metricId: number, geografiaId: number): Promise<SeriePunto[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/serie-historica/${geografiaId}`, { cache: 'no-store' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Network response was not ok for Serie Historica');
    }
    const data = await response.json();
    return data.puntos ?? [];
  } catch (error) {
    console.error('Error fetching serie historica:', error);
    return [];
  }
};

// --- Autenticación ---
export const login = async (email: string, password: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Envía/recibe la cookie httpOnly de sesión
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Credenciales inválidas');
  }
  return await response.json();
};

export const getMe = async (): Promise<Usuario | null> => {
  try {
    const response = await apiFetch('/auth/me');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const logout = async () => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // El redirect de abajo igual cierra la sesión en el browser.
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};

// --- Feed socioeconómico INDEC ---

export interface FeedSocioStagingRow {
  id: number
  aglomerado_cod: number
  aglomerado_nombre: string
  indicador_clave: string
  fecha_dato: string
  valor: number
  estado: string
}

export interface FeedSocioIngestResult {
  inserted: number
  skipped: number
  columnas?: string[]
  indicadores?: string[]
  periodo?: string
  fecha_dato?: string
  source?: string
  motor?: string
  error?: string
}

export interface FeedSocioPreview {
  staging_rows: number
  partido_hechos_estimados: number
  indicador_clave: string
}

export interface FeedSocioPublishResult {
  hechos: number
  fallidas: number
  metrica_id: number
  metrica_clave: string
  archivo_id: number
  log: string
  publicados?: string[]
  error?: string
}

export const getFeedSocioStaging = async (): Promise<FeedSocioStagingRow[]> => {
  const response = await apiFetch('/feeds/socio/staging');
  await throwIfNotOk(response, 'No se pudo cargar el staging');
  return await response.json();
};

export const getFeedSocioPreview = async (): Promise<FeedSocioPreview> => {
  const response = await apiFetch('/feeds/socio/preview');
  await throwIfNotOk(response, 'No se pudo calcular la vista previa');
  return await response.json();
};

export const uploadFeedSocioEphTrimestre = async (
  hogarFile: File,
  individualFile: File,
): Promise<FeedSocioIngestResult> => {
  const formData = new FormData();
  formData.append('hogar_file', hogarFile);
  formData.append('individual_file', individualFile);
  const response = await fetch(`${API_BASE_URL}/feeds/socio/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  await throwIfNotOk(response, 'Error al subir archivos EPH');
  return await response.json();
};

export const ingestFeedSocioSample = async (): Promise<FeedSocioIngestResult> => {
  const response = await fetch(`${API_BASE_URL}/feeds/socio/sample`, {
    method: 'POST',
    credentials: 'include',
  });
  await throwIfNotOk(response, 'Error al procesar trimestre de ejemplo');
  return await response.json();
};

export const downloadFeedSocioLatest = async (): Promise<FeedSocioIngestResult> => {
  const response = await fetch(`${API_BASE_URL}/feeds/socio/download-latest`, {
    method: 'POST',
    credentials: 'include',
  });
  await throwIfNotOk(response, 'Error al descargar último trimestre INDEC');
  return await response.json();
};

export const publishFeedSocio = async (): Promise<FeedSocioPublishResult> => {
  const response = await fetch(`${API_BASE_URL}/feeds/socio/publish`, {
    method: 'POST',
    credentials: 'include',
  });
  await throwIfNotOk(response, 'Error al publicar');
  return await response.json();
};


