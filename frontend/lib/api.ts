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

export const getProvinciasGeoJSON = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/geografia/provincias/geojson`);
    if (!response.ok) {
      throw new Error('Network response was not ok for Provincias GeoJSON');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Provincias GeoJSON:', error);
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

export const updateMetricaVista = async (
  metricId: number,
  body: { mostrar_cruce?: boolean; mostrar_hotspots?: boolean },
) => {
  const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/vista`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update metric vista');
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
  hechos_eliminados?: number
  periodo?: string
  error?: string
}

export interface FeedSocioConfig {
  borrar_trimestre_anterior_al_publicar: boolean
  trimestre_referencia?: string | null
}

export interface WorkspaceConfigResponse {
  document: Record<string, unknown>
  live_paths: string[]
  updated_at?: string | null
}

export const getWorkspaceConfig = async (): Promise<WorkspaceConfigResponse> => {
  const response = await apiFetch('/workspace/config');
  await throwIfNotOk(response, 'No se pudo cargar la configuración del workspace');
  return await response.json();
};

export const patchWorkspaceConfig = async (
  document: Record<string, unknown>,
): Promise<WorkspaceConfigResponse> => {
  const response = await apiFetch('/workspace/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document }),
  });
  await throwIfNotOk(response, 'No se pudo guardar la configuración');
  return await response.json();
};

export const getFeedSocioConfig = async (): Promise<FeedSocioConfig> => {
  const response = await apiFetch('/feeds/socio/config');
  await throwIfNotOk(response, 'No se pudo cargar la configuración del feed');
  return await response.json();
};

export const updateFeedSocioConfig = async (
  borrar_trimestre_anterior_al_publicar: boolean,
): Promise<FeedSocioConfig> => {
  const response = await apiFetch('/feeds/socio/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ borrar_trimestre_anterior_al_publicar }),
  });
  await throwIfNotOk(response, 'No se pudo actualizar la configuración');
  return await response.json();
};

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

// --- Feed web (RSS) ---

export interface FeedSource {
  id: number
  nombre: string
  url: string
  activa: boolean
  municipio_default?: string | null
  provincia_default?: string | null
  ultimo_fetch_at?: string | null
  ultimo_error?: string | null
}

export interface FeedWebTag {
  id: number
  texto: string
  tipo?: string | null
  count?: number | null
}

export interface FeedWebItem {
  id: number
  titulo: string
  url: string
  resumen?: string | null
  publicado_at?: string | null
  fetched_at?: string | null
  source_id: number
  source_nombre: string
  tags: FeedWebTag[]
}

export interface FeedWebSourceFetchResult {
  source_id: number
  nombre: string
  ok: boolean
  inserted: number
  skipped: number
  skipped_untagged: number
  error?: string | null
  classify?: boolean
  import_untagged?: boolean
}

export interface FeedWebFetchResult {
  inserted: number
  purged: number
  classify: boolean
  import_untagged?: boolean
  skipped_untagged?: number
  sources: Array<Record<string, unknown>>
}

export interface FeedWebSummary {
  items_count: number
  sources_active: number
  ultimo_fetch_at?: string | null
  top_tags: FeedWebTag[]
}

export const listFeedWebSources = async (): Promise<FeedSource[]> => {
  const response = await apiFetch('/feeds/web/sources');
  await throwIfNotOk(response, 'No se pudieron cargar las fuentes');
  return await response.json();
};

export const createFeedWebSource = async (body: {
  nombre: string
  url: string
  activa?: boolean
  municipio_default?: string | null
  provincia_default?: string | null
}): Promise<FeedSource> => {
  const response = await apiFetch('/feeds/web/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'No se pudo crear la fuente');
  return await response.json();
};

export const updateFeedWebSource = async (
  id: number,
  body: {
    nombre?: string
    url?: string
    activa?: boolean
    municipio_default?: string | null
    provincia_default?: string | null
  },
): Promise<FeedSource> => {
  const response = await apiFetch(`/feeds/web/sources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'No se pudo actualizar la fuente');
  return await response.json();
};

export const deleteFeedWebSource = async (id: number): Promise<void> => {
  const response = await apiFetch(`/feeds/web/sources/${id}`, { method: 'DELETE' });
  await throwIfNotOk(response, 'No se pudo eliminar la fuente');
};

export const seedFeedWebLocalSources = async (): Promise<{
  ok: boolean
  created: number
  updated: number
  total_file: number
}> => {
  const response = await apiFetch('/feeds/web/sources/seed-locals', { method: 'POST' });
  await throwIfNotOk(response, 'No se pudieron importar medios locales');
  return await response.json();
};

export const seedFeedWebProvincialSources = async (): Promise<{
  ok: boolean
  created: number
  updated: number
  total_file: number
}> => {
  const response = await apiFetch('/feeds/web/sources/seed-provinciales', { method: 'POST' });
  await throwIfNotOk(response, 'No se pudieron importar medios provinciales');
  return await response.json();
};

/** Fetch atómico de una fuente (usar desde la UI en loop). */
export const fetchFeedWebSource = async (sourceId: number): Promise<FeedWebSourceFetchResult> => {
  const response = await apiFetch(`/feeds/web/fetch/${sourceId}`, { method: 'POST' });
  await throwIfNotOk(response, 'Error al actualizar la fuente RSS');
  return await response.json();
};

export const purgeFeedWebRetention = async (): Promise<{ purged: number }> => {
  const response = await apiFetch('/feeds/web/fetch/purge', { method: 'POST' });
  await throwIfNotOk(response, 'Error al aplicar retención');
  return await response.json();
};

/** Batch de todas las activas — puede timeout detrás de nginx; preferir fetchFeedWebSource. */
export const fetchFeedWebNow = async (): Promise<FeedWebFetchResult> => {
  const response = await apiFetch('/feeds/web/fetch', { method: 'POST' });
  await throwIfNotOk(response, 'Error al actualizar feeds RSS');
  return await response.json();
};

export const listFeedWebItems = async (params?: {
  source_id?: number
  tag?: string
  limit?: number
  offset?: number
}): Promise<FeedWebItem[]> => {
  const qs = new URLSearchParams();
  if (params?.source_id != null) qs.set('source_id', String(params.source_id));
  if (params?.tag) qs.set('tag', params.tag);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  const response = await apiFetch(`/feeds/web/items${suffix}`);
  await throwIfNotOk(response, 'No se pudieron cargar los titulares');
  return await response.json();
};

export const listFeedWebTags = async (): Promise<FeedWebTag[]> => {
  const response = await apiFetch('/feeds/web/tags');
  await throwIfNotOk(response, 'No se pudieron cargar los tags');
  return await response.json();
};

export const getFeedWebSummary = async (): Promise<FeedWebSummary> => {
  const response = await apiFetch('/feeds/web/summary');
  await throwIfNotOk(response, 'No se pudo cargar el resumen');
  return await response.json();
};

export interface FeedWebDictEntry {
  id: number
  texto: string
  alias: string
  normalized_alias: string
  tipo: string
  activa: boolean
  created_at?: string | null
}

export const listFeedWebDictionary = async (params?: {
  tipo?: string
  only_active?: boolean
}): Promise<FeedWebDictEntry[]> => {
  const qs = new URLSearchParams();
  if (params?.tipo) qs.set('tipo', params.tipo);
  if (params?.only_active != null) qs.set('only_active', String(params.only_active));
  const suffix = qs.toString() ? `?${qs}` : '';
  const response = await apiFetch(`/feeds/web/dictionary${suffix}`);
  await throwIfNotOk(response, 'No se pudo cargar el diccionario');
  return await response.json();
};

export const createFeedWebDictEntry = async (body: {
  texto: string
  alias: string
  tipo?: string
  activa?: boolean
}): Promise<FeedWebDictEntry> => {
  const response = await apiFetch('/feeds/web/dictionary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'No se pudo crear la entrada');
  return await response.json();
};

export const updateFeedWebDictEntry = async (
  id: number,
  body: { texto?: string; alias?: string; tipo?: string; activa?: boolean },
): Promise<FeedWebDictEntry> => {
  const response = await apiFetch(`/feeds/web/dictionary/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'No se pudo actualizar la entrada');
  return await response.json();
};

export const deleteFeedWebDictEntry = async (id: number): Promise<void> => {
  const response = await apiFetch(`/feeds/web/dictionary/${id}`, { method: 'DELETE' });
  await throwIfNotOk(response, 'No se pudo eliminar la entrada');
};

export const deleteFeedWebItem = async (id: number): Promise<void> => {
  const response = await apiFetch(`/feeds/web/items/${id}`, { method: 'DELETE' });
  await throwIfNotOk(response, 'No se pudo eliminar el titular');
};

export const setFeedWebItemTags = async (
  id: number,
  tags: Array<{ texto: string; tipo?: string | null }>,
): Promise<FeedWebItem> => {
  const response = await apiFetch(`/feeds/web/items/${id}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  await throwIfNotOk(response, 'No se pudieron guardar los tags');
  return await response.json();
};

export const retagFeedWebItem = async (id: number): Promise<FeedWebItem> => {
  const response = await apiFetch(`/feeds/web/items/${id}/retags`, { method: 'POST' });
  await throwIfNotOk(response, 'No se pudo reaplicar el diccionario');
  return await response.json();
};

export interface FeedWebAgendaMetrica {
  metrica_id: number
  clave: string
  nombre_amigable: string
  created: boolean
  hechos: number
  hechos_reemplazados: number
  is_active: boolean
  valor_min?: number | null
  valor_max?: number | null
}

export interface FeedWebAgendaPublishResult {
  ok: boolean
  window_days: number
  score: string
  min_score?: number
  min_municipios?: number
  alcance?: string
  items_used: number
  archivo_id?: number | null
  metricas: FeedWebAgendaMetrica[]
  hechos: number
  hechos_reemplazados: number
  metricas_limpiadas?: number
  skipped_temas?: Array<{ tema: string; reason: string; municipios: number }>
  skipped_low_score?: number
  unresolved_municipios: string[]
  log?: string | null
  error?: string | null
}

export const publishFeedWebAgenda = async (body?: {
  window_days?: number
  score?: 'count' | 'recency'
  min_score?: number
  min_municipios?: number
  require_variance?: boolean
  alcance?: 'pba' | 'nacional'
}): Promise<FeedWebAgendaPublishResult> => {
  const response = await apiFetch('/feeds/web/publish-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      window_days: body?.window_days ?? 7,
      score: body?.score ?? 'count',
      min_score: body?.min_score ?? 2,
      min_municipios: body?.min_municipios ?? 2,
      require_variance: body?.require_variance ?? true,
      alcance: body?.alcance ?? 'pba',
    }),
  });
  await throwIfNotOk(response, 'No se pudo publicar la agenda al mapa');
  return await response.json();
};


