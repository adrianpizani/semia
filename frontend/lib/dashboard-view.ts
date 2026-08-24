import { AnyFiltro } from '@/lib/types';

const STORAGE_KEY = 'semia.dashboard.view';
const VERSION = 1;

export type DashboardViewState = {
  selectedPrimaryMetric: number | null;
  selectedSecondaryMetrics: number[];
  filters: AnyFiltro[];
};

function isValidView(value: unknown): value is DashboardViewState & { v: number } {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Record<string, unknown>;
  return parsed.v === VERSION
    && (parsed.selectedPrimaryMetric === null || typeof parsed.selectedPrimaryMetric === 'number')
    && Array.isArray(parsed.selectedSecondaryMetrics)
    && Array.isArray(parsed.filters);
}

export function loadDashboardView(): DashboardViewState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidView(parsed)) return null;
    return {
      selectedPrimaryMetric: parsed.selectedPrimaryMetric,
      selectedSecondaryMetrics: parsed.selectedSecondaryMetrics,
      filters: parsed.filters,
    };
  } catch {
    return null;
  }
}

export function saveDashboardView(state: DashboardViewState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...state }));
  } catch {
    // quota / modo privado: la sesión sigue, sin persistir.
  }
}
