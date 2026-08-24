import type { Feature, Geometry } from 'geojson';

// --- Tipos Comunes ---
export interface DistritoProperties {
  nombre: string;
  nivel: string;
  parent_id?: number;
}
export type DistritoFeature = Feature<Geometry, DistritoProperties>;

export interface ElectoralData {
  geografia_id: number;
  nombre: string;
  resultados: { partido: string; votos: number }[];
  ganador: { partido: string; votos: number } | null;
}

// Enum para TipoMetrica (debe coincidir con el backend)
export enum TipoMetricaEnum {
  ELECTORAL = "ELECTORAL",
  DEMOGRAFICA = "DEMOGRAFICA",
  GEOGRAFICA = "GEOGRAFICA",
  TEMPORAL = "TEMPORAL",
  ECONOMICA = "ECONOMICA",
}

export interface Metrica {
  id: number;
  nombre_amigable: string;
  is_active: boolean;
  tipo: TipoMetricaEnum;
  archivo?: {
    id: number;
    nombre_visible: string;
  };
}

export interface GenericData {
  geografia_id: number;
  geografia_nombre: string;
  metrica_id: number;
  metrica_nombre: string;
  valor: number | null;
}

export type MunicipioTooltipSecondary = {
  nombre: string;
  valor: number;
};

export type MunicipioTooltipSecondaries = Record<number, MunicipioTooltipSecondary[]>;

// --- Tipos para Filtros Genéricos ---

interface FiltroBase {
  metrica_id: number;
}

export interface FiltroCategorico extends FiltroBase {
  tipo: "categoria";
  // Dimensión de dimension_extra sobre la que filtra:
  // 'agrupacion_nombre' (partido), 'año', 'votos_tipo'.
  dimension: string;
  valores: string[]; // e.g., ["PARTIDO_A", "FRENTE_DE_TODOS"]
}

export interface FiltroRango extends FiltroBase {
  tipo: "rango";
  rango: [number, number]; // e.g., [min_pbg, max_pbg]
}

export type AnyFiltro = FiltroCategorico | FiltroRango;

// Opciones disponibles de una métrica para poblar los selectores de filtro.
export interface MetricaOpciones {
  partidos: string[];
  años: string[];
  votos_tipos: string[];
}

// Usuario autenticado (coincide con el schema Usuario del backend).
export interface Usuario {
  id: number;
  email: string;
  nombre: string | null;
  rol: "admin" | "viewer";
  activo: boolean;
}
