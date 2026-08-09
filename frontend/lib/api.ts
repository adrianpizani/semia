// Helper to determine the base URL for API calls
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use relative path
    return '';
  }
  // Server-side: use absolute path for server-side rendering
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'; // Default to localhost for local development
};

const API_BASE_URL = `${getBaseUrl()}/api/v1`;

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
    const response = await fetch(`${API_BASE_URL}/archivos`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Network response was not ok for Archivos');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching archivos:', error);
    return [];
  }
};

export const uploadArchivo = async (formData: FormData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/archivos`, {
      method: 'POST',
      body: formData,
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
    const response = await fetch(`${API_BASE_URL}/metricas`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Network response was not ok for Metricas');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return [];
  }
};

export const toggleMetrica = async (metricId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/metricas/${metricId}/toggle`, {
      method: 'POST',
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

export const deleteArchivo = async (archivoId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/archivos/${archivoId}`, {
      method: 'DELETE',
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

import { AnyFiltro, MetricaOpciones } from './types';

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


