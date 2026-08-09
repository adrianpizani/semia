"use client"
import { Calendar, Search, SlidersHorizontal, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import Link from "next/link"
import { useState, useEffect, useMemo, useCallback, SetStateAction } from "react"
import { Metrica, TipoMetricaEnum, AnyFiltro, FiltroCategorico, FiltroRango } from "@/lib/types"
import { formatCompact, fromNormPosition, RangeScale } from "@/lib/range-utils"

// --- Etiquetas legibles por dimensión (para los badges de filtros activos) ---
const DIMENSION_LABELS: { [k: string]: string } = {
  agrupacion_nombre: "Partido",
  año: "Año",
  votos_tipo: "Tipo de voto",
};

// --- Sub-componente para Filtro Electoral (partido + año + tipo de voto) ---
const ElectoralFilter = ({
  metric,
  onDimensionFilterChange,
  availableParties,
  availableYears,
  availableVoteTypes,
}: {
  metric: Metrica;
  onDimensionFilterChange: (metricId: number, dimension: string, valores: string[]) => void;
  availableParties: string[];
  availableYears: string[];
  availableVoteTypes: string[];
}) => {
  const [selectedParty, setSelectedParty] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  // Por defecto se muestran los votos válidos (POSITIVO) para que el ganador del mapa
  // no incluya nulos/en blanco. El usuario puede cambiar a "Todos los tipos".
  const [selectedType, setSelectedType] = useState<string>("POSITIVO");

  const partidos = availableParties && availableParties.length > 0 ? availableParties : [];
  const años = availableYears && availableYears.length > 0 ? availableYears : [];
  // Garantizamos que "POSITIVO" (el default) siempre esté entre las opciones.
  const tipos = Array.from(new Set([...(availableVoteTypes ? availableVoteTypes : []), "POSITIVO"]));

  useEffect(() => {
    onDimensionFilterChange(metric.id, "agrupacion_nombre", selectedParty === "all" ? [] : [selectedParty]);
  }, [selectedParty, metric.id, onDimensionFilterChange]);
  useEffect(() => {
    onDimensionFilterChange(metric.id, "año", selectedYear === "all" ? [] : [selectedYear]);
  }, [selectedYear, metric.id, onDimensionFilterChange]);
  useEffect(() => {
    onDimensionFilterChange(metric.id, "votos_tipo", selectedType === "all" ? [] : [selectedType]);
  }, [selectedType, metric.id, onDimensionFilterChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedParty} onValueChange={setSelectedParty}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filtrar por partido..." />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">Todos los partidos</SelectItem>
          {partidos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selectedYear} onValueChange={setSelectedYear}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Año..." />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">Todos los años</SelectItem>
          {años.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selectedType} onValueChange={setSelectedType}>
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Tipo de voto..." />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">Todos los tipos</SelectItem>
          {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
};

// --- Sub-componente para Filtro de Rango (métricas económicas: PBG, etc.) ---
// Data-driven: usa la escala detectada desde la muestra (log si hay mucha dispersión).
const RangeFilter = ({ metric, range, onFilterChange }: {
  metric: Metrica;
  range?: { min: number; max: number; scale: RangeScale };
  onFilterChange: (metricId: number, filter: FiltroRango | null) => void;
}) => {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  const dataScale = range?.scale ?? 'linear';

  // Slider interno en posición normalizada 0..100 (escala uniforme para el manejador).
  const [pos, setPos] = useState<[number, number]>([0, 100]);
  const [scaleMode, setScaleMode] = useState<RangeScale>(dataScale);

  // Sincroniza la escala detectada por la data (puede cambiar al cambiar de métrica).
  useEffect(() => {
    setScaleMode(dataScale);
    setPos([0, 100]);
  }, [dataScale, min, max]);

  const toValue = useCallback(
    (p: number) => fromNormPosition(min, max, p / 100, scaleMode),
    [min, max, scaleMode]
  );

  const vmin = toValue(pos[0]);
  const vmax = toValue(pos[1]);
  const isFullRange = pos[0] <= 0.5 && pos[1] >= 99.5;

  const handleValueCommit = (committed: number[]) => {
    const full = committed[0] <= 0.5 && committed[1] >= 99.5;
    if (full) {
      onFilterChange(metric.id, null);
    } else {
      const a = fromNormPosition(min, max, committed[0] / 100, scaleMode);
      const b = fromNormPosition(min, max, committed[1] / 100, scaleMode);
      onFilterChange(metric.id, { metrica_id: metric.id, tipo: 'rango', rango: [a, b] });
    }
  };

  const handleEscalaChange = (value: string) => {
    setScaleMode(value as RangeScale);
    setPos([0, 100]);
    onFilterChange(metric.id, null); // al cambiar de escala, se limpia el filtro aplicado
  };

  const handleClear = () => {
    setPos([0, 100]);
    onFilterChange(metric.id, null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium w-[150px] truncate" title={metric.nombre_amigable}>{metric.nombre_amigable}:</span>
      <Slider
        min={0}
        max={100}
        step={1}
        value={pos}
        onValueChange={(v) => setPos([v[0] ?? 0, v[1] ?? 100])}
        onValueCommit={handleValueCommit}
        className="w-[280px]"
      />
      <span className="text-xs font-mono text-muted-foreground w-[170px] text-right">
        {isFullRange ? 'Todo el rango' : `${formatCompact(vmin)} – ${formatCompact(vmax)}`}
      </span>
      <Select value={scaleMode} onValueChange={handleEscalaChange}>
        <SelectTrigger className="w-[110px]"><SelectValue placeholder="Escala" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="log">Log</SelectItem>
          <SelectItem value="linear">Lineal</SelectItem>
        </SelectContent>
      </Select>
      {!isFullRange && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs">Limpiar</Button>
      )}
    </div>
  );
};

interface FilterBarProps {
  activeMetrics?: Metrica[];
  selectedPrimaryMetric?: number | null;
  onPrimaryMetricChange?: (metricId: number | null) => void;
  selectedSecondaryMetrics?: number[];
  onSecondaryMetricsChange?: (metricIds: number[]) => void;
  filters?: AnyFiltro[];
  onFiltersChange?: (updater: SetStateAction<AnyFiltro[]>) => void;
  availableParties?: string[];
  availableYears?: string[];
  availableVoteTypes?: string[];
  metricRanges?: {[metricId: number]: {min: number, max: number, scale: 'log' | 'linear'}};
}

export function FilterBar({
  activeMetrics = [],
  selectedPrimaryMetric,
  onPrimaryMetricChange,
  selectedSecondaryMetrics = [],
  onSecondaryMetricsChange,
  filters = [],
  onFiltersChange,
  availableParties = [],
  availableYears = [],
  availableVoteTypes = [],
  metricRanges = {}
}: FilterBarProps) {
  const [showSecondaryMetricsPopover, setShowSecondaryMetricsPopover] = useState(false)

  const handlePrimaryMetricChange = (value: string) => {
    const newPrimaryMetricId = value === "none" ? null : Number(value);
    if (onPrimaryMetricChange) {
      onPrimaryMetricChange(newPrimaryMetricId);
    }
    if (newPrimaryMetricId !== null && selectedSecondaryMetrics.includes(newPrimaryMetricId)) {
      if (onSecondaryMetricsChange) {
        onSecondaryMetricsChange(selectedSecondaryMetrics.filter(id => id !== newPrimaryMetricId));
      }
    }
  }

  const handleSecondaryMetricToggle = (metricId: number, isChecked: boolean) => {
    if (!onSecondaryMetricsChange) return;
    if (isChecked) {
      onSecondaryMetricsChange([...selectedSecondaryMetrics, metricId]);
    } else {
      onSecondaryMetricsChange(selectedSecondaryMetrics.filter(id => id !== metricId));
    }
  }

  const updateOrRemoveFilter = useCallback((metricId: number, filter: AnyFiltro | null) => {
    if (!onFiltersChange) return;
    onFiltersChange(prevFilters => {
      const otherFilters = prevFilters.filter(f => f.metrica_id !== metricId);
      return filter ? [...otherFilters, filter] : otherFilters;
    });
  }, [onFiltersChange]);

  // Actualiza un filtro categórico de una métrica, identificándolo por su dimensión
  // (partido / año / tipo de voto) para permitir varios filtros por métrica.
  const updateDimensionFilter = useCallback((metricId: number, dimension: string, valores: string[]) => {
    if (!onFiltersChange) return;
    onFiltersChange(prevFilters => {
      const others = prevFilters.filter(f =>
        !(f.metrica_id === metricId && f.tipo === 'categoria' && f.dimension === dimension)
      );
      return valores.length > 0
        ? [...others, { metrica_id: metricId, tipo: 'categoria', dimension, valores }]
        : others;
    });
  }, [onFiltersChange]);

  const availableSecondaryMetrics = activeMetrics.filter(
    metric => metric.id !== selectedPrimaryMetric
  );

  const selectedMetrics = useMemo(() => {
    const allIds = new Set([
      ...(selectedPrimaryMetric ? [selectedPrimaryMetric] : []),
      ...selectedSecondaryMetrics
    ]);
    return activeMetrics.filter(m => allIds.has(m.id));
  }, [selectedPrimaryMetric, selectedSecondaryMetrics, activeMetrics]);

  // Elimina un solo filtro (por dimensión en categóricos, o el rango de la métrica).
  const removeFilterSlot = (metricId: number, filter: AnyFiltro) => {
    if (!onFiltersChange) return;
    onFiltersChange(prevFilters => prevFilters.filter(f => {
      if (f.metrica_id !== metricId) return true;
      if (filter.tipo === 'categoria') {
        return !(f.tipo === 'categoria' && f.dimension === (filter as FiltroCategorico).dimension);
      }
      return f.tipo !== 'rango';
    }));
  }

  return (
    <div className="border-b border-border bg-card relative">
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center gap-3">
          {onPrimaryMetricChange && (
            <Select value={selectedPrimaryMetric?.toString() ?? "none"} onValueChange={handlePrimaryMetricChange}>
              <SelectTrigger className="w-[250px]"><SelectValue placeholder="Métrica Principal..." /></SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="none">Ninguna métrica</SelectItem>
                {activeMetrics.map(metric => <SelectItem key={metric.id} value={metric.id.toString()}>{metric.nombre_amigable}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {onSecondaryMetricsChange && (
            <Popover open={showSecondaryMetricsPopover} onOpenChange={setShowSecondaryMetricsPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[250px] justify-between">
                  Métricas Secundarias
                  {selectedSecondaryMetrics.length > 0 && <Badge variant="secondary" className="ml-2">{selectedSecondaryMetrics.length}</Badge>}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0 z-[9999]">
                <div className="flex flex-col space-y-2 p-2">
                  {availableSecondaryMetrics.length > 0 ? (
                    availableSecondaryMetrics.map(metric => (
                      <div key={metric.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`sec-metric-${metric.id}`}
                          checked={selectedSecondaryMetrics.includes(metric.id)}
                          onCheckedChange={(checked) => handleSecondaryMetricToggle(metric.id, !!checked)}
                        />
                        <label htmlFor={`sec-metric-${metric.id}`} className="text-sm font-medium">{metric.nombre_amigable}</label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground p-2">No hay métricas secundarias disponibles.</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {selectedMetrics.length > 0 && (
          <div className="flex items-center gap-4 pt-3 border-t border-dashed">
            <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
            {selectedMetrics.map(metric => {
              if (metric.tipo === TipoMetricaEnum.ELECTORAL) {
                return <ElectoralFilter key={metric.id} metric={metric} onDimensionFilterChange={updateDimensionFilter} availableParties={availableParties} availableYears={availableYears} availableVoteTypes={availableVoteTypes} />;
              }
              if (metric.tipo === TipoMetricaEnum.ECONOMICA) {
                return <RangeFilter key={metric.id} metric={metric} range={metricRanges[metric.id]} onFilterChange={updateOrRemoveFilter} />;
              }
              return null;
            })}
          </div>
        )}
      </div>
      {filters.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filtros activos:</span>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {filters.map((filter, idx) => {
                const metric = activeMetrics.find(m => m.id === filter.metrica_id);
                if (!metric) return null;
                const dimension = filter.tipo === 'categoria' ? (DIMENSION_LABELS[filter.dimension] || filter.dimension) : 'Rango';
                const label = filter.tipo === 'categoria'
                  ? `${dimension}: ${filter.valores.join(', ')}`
                  : `${dimension}: ${filter.rango[0].toLocaleString()}-${filter.rango[1].toLocaleString()}`;
                const slotKey = `${metric.id}-${filter.tipo}-${filter.tipo === 'categoria' ? filter.dimension : 'rango'}-${idx}`;

                return (
                  <Badge key={slotKey} variant="secondary" className="gap-1 pr-1">
                    <span className="text-xs">{label}</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => removeFilterSlot(metric.id, filter)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onFiltersChange && onFiltersChange([])} className="h-7 text-xs">
              Limpiar filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}