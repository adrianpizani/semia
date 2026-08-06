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

// --- Sub-componente para Filtro Electoral ---
const ElectoralFilter = ({ metric, onFilterChange, availableParties }: { metric: Metrica, onFilterChange: (metricId: number, filter: FiltroCategorico | null) => void, availableParties: string[] }) => {
  const [selectedParty, setSelectedParty] = useState<string>("all");
  
  const partidos = availableParties && availableParties.length > 0 ? availableParties : ["UNION POR LA PATRIA", "JUNTOS POR EL CAMBIO", "LA LIBERTAD AVANZA"];

  useEffect(() => {
    if (selectedParty === "all") {
      onFilterChange(metric.id, null);
    } else {
      onFilterChange(metric.id, {
        metrica_id: metric.id,
        tipo: "categoria",
        valores: [selectedParty],
      });
    }
  }, [selectedParty, metric.id, onFilterChange]);

  return (
    <Select value={selectedParty} onValueChange={setSelectedParty}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Filtrar por partido..." />
      </SelectTrigger>
      <SelectContent className="z-[9999]">
        <SelectItem value="all">Todos los partidos</SelectItem>
        {partidos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

// --- Sub-componente para Filtro de Rango (PBG) ---
const RangeFilter = ({ metric, range, onFilterChange }: { metric: Metrica, range?: {min: number, max: number}, onFilterChange: (metricId: number, filter: FiltroRango | null) => void }) => {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  const [value, setValue] = useState<[number, number]>([min, max]);

  // Update internal value when dynamic range arrives from parent
  useEffect(() => {
    if (range) {
      setValue([range.min, range.max]);
    }
  }, [range]);

  const handleValueChange = (newValue: [number, number]) => {
    // Only update the local UI state for smooth sliding
    setValue(newValue);
  };

  const handleValueCommit = (committedValue: [number, number]) => {
    // Actually apply the filter when the user stops dragging
    if (committedValue[0] === min && committedValue[1] === max) {
      onFilterChange(metric.id, null);
    } else {
      onFilterChange(metric.id, {
        metrica_id: metric.id,
        tipo: "rango",
        rango: committedValue,
      });
    }
  };

  return (
    <div className="flex items-center gap-4 w-[600px]">
      <span className="text-sm font-medium w-[150px] truncate" title={metric.nombre_amigable}>{metric.nombre_amigable}:</span>
      <Slider
        min={min}
        max={max}
        step={(max - min) / 100 || 1}
        value={value}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        className="flex-1"
      />
      <span className="text-xs font-mono text-muted-foreground w-[150px] text-right">
        {value[0].toLocaleString()}-{value[1].toLocaleString()}
      </span>
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
  metricRanges?: {[metricId: number]: {min: number, max: number}};
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

  const removeFilterForMetric = (metricId: number) => {
    if (onFiltersChange) {
      onFiltersChange(prevFilters => prevFilters.filter(f => f.metrica_id !== metricId));
    }
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
                return <ElectoralFilter key={metric.id} metric={metric} onFilterChange={updateOrRemoveFilter} availableParties={availableParties} />;
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
              {filters.map((filter) => {
                const metric = activeMetrics.find(m => m.id === filter.metrica_id);
                if (!metric) return null;
                const label = filter.tipo === 'categoria' 
                  ? `${metric.nombre_amigable}: ${filter.valores.join(', ')}`
                  : `${metric.nombre_amigable}: ${filter.rango[0]}-${filter.rango[1]}`;
                
                return (
                  <Badge key={metric.id} variant="secondary" className="gap-1 pr-1">
                    <span className="text-xs">{label}</span>
                    <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => removeFilterForMetric(metric.id)}>
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