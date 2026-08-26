"use client"
import { Calendar, Search, SlidersHorizontal, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import Link from "next/link"
import { ReactNode, useState, useEffect, useMemo, useCallback, SetStateAction } from "react"
import { Metrica, TipoMetricaEnum, AnyFiltro, FiltroCategorico, FiltroRango } from "@/lib/types"
import { formatCompact, fromNormPosition, toNormPosition, RangeScale, resolveRangeScale } from "@/lib/range-utils"
import { cn } from "@/lib/utils"

const dropdownSurface = "bg-white hover:bg-white"

// --- Etiquetas legibles por dimensión (para los badges de filtros activos) ---
const DIMENSION_LABELS: { [k: string]: string } = {
  agrupacion_nombre: "Partido",
  año: "Año",
  votos_tipo: "Tipo de voto",
};

function dimensionValue(filters: AnyFiltro[], metricId: number, dimension: string): string | undefined {
  const match = filters.find((f): f is FiltroCategorico =>
    f.tipo === "categoria" && f.metrica_id === metricId && f.dimension === dimension
  );
  return match?.valores[0];
}

// --- Sub-componente para Filtro Electoral (partido + año + tipo de voto) ---
const ElectoralFilter = ({
  metric,
  filters,
  onDimensionFilterChange,
  availableParties,
  availableYears,
  availableVoteTypes,
}: {
  metric: Metrica;
  filters: AnyFiltro[];
  onDimensionFilterChange: (metricId: number, dimension: string, valores: string[]) => void;
  availableParties: string[];
  availableYears: string[];
  availableVoteTypes: string[];
}) => {
  const selectedParty = dimensionValue(filters, metric.id, "agrupacion_nombre") ?? "all";
  const selectedYear = dimensionValue(filters, metric.id, "año") ?? "all";
  const selectedType = dimensionValue(filters, metric.id, "votos_tipo") ?? "all";

  const partidos = Array.from(new Set([
    ...(availableParties ?? []),
    ...(selectedParty !== "all" ? [selectedParty] : []),
  ])).sort();
  const años = Array.from(new Set([
    ...(availableYears ?? []),
    ...(selectedYear !== "all" ? [selectedYear] : []),
  ])).sort();
  const tipos = Array.from(new Set([...(availableVoteTypes ? availableVoteTypes : []), "POSITIVO"]));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedParty}
        onValueChange={(value) => onDimensionFilterChange(metric.id, "agrupacion_nombre", value === "all" ? [] : [value])}
      >
        <SelectTrigger className={cn("w-[220px]", dropdownSurface)}>
          <SelectValue placeholder="Intensidad por partido..." />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">Ganador por distrito</SelectItem>
          {partidos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={selectedYear}
        onValueChange={(value) => onDimensionFilterChange(metric.id, "año", value === "all" ? [] : [value])}
      >
        <SelectTrigger className={cn("w-[130px]", dropdownSurface)}>
          <SelectValue placeholder="Año..." />
        </SelectTrigger>
        <SelectContent className="z-[9999]">
          <SelectItem value="all">Todos los años</SelectItem>
          {años.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={selectedType}
        onValueChange={(value) => onDimensionFilterChange(metric.id, "votos_tipo", value === "all" ? [] : [value])}
      >
        <SelectTrigger className={cn("w-[170px]", dropdownSurface)}>
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
// Data-driven: usa la escala configurada en gestión de métricas o la detectada automáticamente.
// Desacoplado: el rango base (min/max/escala) es fijo (data sin filtrar) y la selección
// del usuario (ventana en valores absolutos) se mantiene al aplicar el filtro, sin reset.
const RangeFilter = ({ metric, range, initialWin, onFilterChange, resetSignal }: {
  metric: Metrica;
  range?: { min: number; max: number; scale: RangeScale };
  initialWin?: [number, number];
  onFilterChange: (metricId: number, filter: FiltroRango | null) => void;
  resetSignal?: number;
}) => {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  const detectedScale = range?.scale ?? 'linear';
  const scaleMode = resolveRangeScale(metric.escala_rango, detectedScale, min);

  // Ventana seleccionada en VALORES ABSOLUTOS (fuente de verdad del usuario).
  const [win, setWin] = useState<[number, number]>([min, max]);

  // Sincroniza la ventana con el filtro persistido (o rango completo si no hay filtro).
  // Al quitar un tag de rango, initialWin pasa a undefined y el slider vuelve a [min, max].
  useEffect(() => {
    if (!range || min >= max) return;
    if (initialWin) {
      setWin([
        Math.max(min, Math.min(initialWin[0], max)),
        Math.max(min, Math.min(initialWin[1], max)),
      ]);
    } else {
      setWin([min, max]);
    }
  }, [initialWin, min, max, range]);

  // Reset externo (botón "Limpiar filtros"): refuerza el rango completo.
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === 0) return;
    setWin([min, max]);
  }, [resetSignal, min, max]);

  const toValue = useCallback(
    (p: number) => fromNormPosition(min, max, p / 100, scaleMode),
    [min, max, scaleMode]
  );
  const toPos = useCallback(
    (v: number) => Math.max(0, Math.min(100, toNormPosition(min, max, v, scaleMode) * 100)),
    [min, max, scaleMode]
  );

  const pos: [number, number] = [toPos(win[0]), toPos(win[1])];
  const isFullRange = pos[0] <= 0.5 && pos[1] >= 99.5;

  const handleDrag = (v: number[]) => {
    setWin([toValue(v[0] ?? 0), toValue(v[1] ?? 100)]);
  };

  const handleCommit = () => {
    if (isFullRange) {
      onFilterChange(metric.id, null);
    } else {
      onFilterChange(metric.id, { metrica_id: metric.id, tipo: 'rango', rango: [win[0], win[1]] });
    }
  };

  const handleClear = () => {
    setWin([min, max]);
    onFilterChange(metric.id, null);
  };

  return (
    <div
      className={cn(
        "flex min-w-[272px] max-w-[320px] flex-col gap-2 rounded-lg border bg-white px-3 py-2.5 transition-colors",
        isFullRange ? "border-primary/20" : "border-primary/45 shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium leading-tight" title={metric.nombre_amigable}>
            {metric.nombre_amigable}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {isFullRange
              ? "Todo el rango"
              : `${formatCompact(win[0])} – ${formatCompact(win[1])}`}
          </p>
        </div>
        {!isFullRange && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Limpiar filtro de ${metric.nombre_amigable}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Slider
        min={0}
        max={100}
        step={0.5}
        value={pos}
        onValueChange={handleDrag}
        onValueCommit={handleCommit}
        className={cn(
          "w-full py-1",
          "[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-muted",
          "[&_[data-slot=slider-range]]:bg-primary/90",
          "[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2",
          "[&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-background",
          "[&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-thumb]]:hover:ring-4",
          "[&_[data-slot=slider-thumb]]:hover:ring-primary/20",
        )}
      />

      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/80">
        <span>{formatCompact(min)}</span>
        <span>{formatCompact(max)}</span>
      </div>
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
  actions?: ReactNode;
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
  metricRanges = {},
  actions,
}: FilterBarProps) {
  const [showSecondaryMetricsPopover, setShowSecondaryMetricsPopover] = useState(false)
  // Contador que se incrementa cada vez que el usuario hace "Limpiar filtros".
  // Se pasa a los RangeFilter para forzar el reseteo visual de la ventana
  // cuando el padre borra el array de filtros (RangeFilter mantiene estado local).
  const [rangeResetSignal, setRangeResetSignal] = useState(0)

  const handleClearAllFilters = () => {
    if (onFiltersChange) onFiltersChange([])
    setRangeResetSignal(s => s + 1)
  }

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
    const metric = activeMetrics.find(m => m.id === newPrimaryMetricId);
    if (metric?.tipo === TipoMetricaEnum.ELECTORAL && onFiltersChange) {
      onFiltersChange(prevFilters => {
        const others = prevFilters.filter(f =>
          !(f.metrica_id === metric.id && f.tipo === "categoria" && f.dimension === "votos_tipo")
        );
        return [...others, { metrica_id: metric.id, tipo: "categoria", dimension: "votos_tipo", valores: ["POSITIVO"] }];
      });
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

  const availablePrimaryMetrics = useMemo(
    () => activeMetrics.filter(m => m.tipo === TipoMetricaEnum.ELECTORAL),
    [activeMetrics]
  );

  // Métrica objetos derivados de los IDs seleccionados.
  const primaryMetric = selectedPrimaryMetric
    ? activeMetrics.find(m => m.id === selectedPrimaryMetric) ?? null
    : null;
  const secondaryMetrics = useMemo(
    () => activeMetrics.filter(m => selectedSecondaryMetrics.includes(m.id)),
    [selectedSecondaryMetrics, activeMetrics]
  );

  // Renderiza el filtro correspondiente a una métrica según su tipo.
  // Numéricas no-electorales (ECONOMICA, DEMOGRAFICA) usan el mismo slider de rango;
  // eso evita que un Poblacion_Total o un Indice_NBI queden sin UI de filtro
  // cuando el usuario los marca como DEMOGRAFICA al subir el CSV.
  const renderMetricFilter = (metric: Metrica) => {
    if (metric.tipo === TipoMetricaEnum.ELECTORAL) {
      return <ElectoralFilter key={metric.id} metric={metric} filters={filters} onDimensionFilterChange={updateDimensionFilter} availableParties={availableParties} availableYears={availableYears} availableVoteTypes={availableVoteTypes} />;
    }
    if (metric.tipo === TipoMetricaEnum.ECONOMICA || metric.tipo === TipoMetricaEnum.DEMOGRAFICA) {
      const savedRange = filters.find((f): f is FiltroRango => f.tipo === "rango" && f.metrica_id === metric.id);
      return <RangeFilter key={metric.id} metric={metric} range={metricRanges[metric.id]} initialWin={savedRange?.rango} onFilterChange={updateOrRemoveFilter} resetSignal={rangeResetSignal} />;
    }
        return null;
  };

  // Sólo renderizamos el separador+ filtro cuando la métrica tiene un componente de filtro.
  const primaryFilter = primaryMetric ? renderMetricFilter(primaryMetric) : null;
  const secondaryFilters = secondaryMetrics.filter(
    m => m.tipo === TipoMetricaEnum.ELECTORAL || m.tipo === TipoMetricaEnum.ECONOMICA || m.tipo === TipoMetricaEnum.DEMOGRAFICA
  );

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
    <div className="relative border-b border-primary/15 bg-primary/[0.07]">
      <div className="px-6 py-4 space-y-3">
        {/* Fila 1: métrica primaria (electoral) + sus filtros a la derecha */}
        <div className="flex items-center gap-3">
          {onPrimaryMetricChange && (
            <Select value={selectedPrimaryMetric?.toString() ?? "none"} onValueChange={handlePrimaryMetricChange}>
              <SelectTrigger
                className={cn(
                  "w-[250px]",
                  dropdownSurface,
                  (selectedPrimaryMetric?.toString() ?? "none") === "none" ? "text-muted-foreground" : "",
                )}
              >
                <SelectValue placeholder="Métrica primaria" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="none">Métrica primaria</SelectItem>
                {availablePrimaryMetrics.map(metric => <SelectItem key={metric.id} value={metric.id.toString()}>{metric.nombre_amigable}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {primaryFilter && (
            <>
              <Separator orientation="vertical" className="h-6" />
              {primaryFilter}
            </>
          )}
          {actions && <div className="ml-auto shrink-0">{actions}</div>}
        </div>

        {/* Fila 2: selector de métricas secundarias + sus filtros a la derecha */}
        <div className="flex items-center gap-3">
          {onSecondaryMetricsChange && (
            <Popover open={showSecondaryMetricsPopover} onOpenChange={setShowSecondaryMetricsPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[250px] justify-between font-normal", dropdownSurface)}>
                  <span
                    className={
                      selectedSecondaryMetrics.length === 0
                        ? "truncate text-muted-foreground"
                        : "truncate"
                    }
                  >
                    Métricas secundarias
                  </span>
                  <span className="ml-2 flex shrink-0 items-center gap-2">
                    {selectedSecondaryMetrics.length > 0 && (
                      <Badge variant="secondary">{selectedSecondaryMetrics.length}</Badge>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </span>
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
          {secondaryFilters.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex flex-wrap items-stretch gap-2">
                {secondaryFilters.map(metric => renderMetricFilter(metric))}
              </div>
            </>
          )}
        </div>
      </div>
      {filters.length > 0 && (
        <div className="border-t border-primary/10 bg-white px-6 py-3">
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
            <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="h-7 text-xs">
              Limpiar filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}