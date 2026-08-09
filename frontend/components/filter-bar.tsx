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
import { useState, useEffect, useMemo, useCallback, useRef, SetStateAction } from "react"
import { Metrica, TipoMetricaEnum, AnyFiltro, FiltroCategorico, FiltroRango } from "@/lib/types"
import { formatCompact, fromNormPosition, toNormPosition, RangeScale } from "@/lib/range-utils"

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
// Desacoplado: el rango base (min/max/escala) es fijo (data sin filtrar) y la selección
// del usuario (ventana en valores absolutos) se mantiene al aplicar el filtro, sin reset.
const RangeFilter = ({ metric, range, onFilterChange, resetSignal }: {
  metric: Metrica;
  range?: { min: number; max: number; scale: RangeScale };
  onFilterChange: (metricId: number, filter: FiltroRango | null) => void;
  // Cambia este número para forzar al slider a volver a [min, max]. Lo usa
  // "Limpiar filtros" para resetear la ventana visual cuando el padre borra
  // los filtros (no podemos resetear desde onFilterChange porque al limpiar
  // ya no hay nada que commitear).
  resetSignal?: number;
}) => {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  const dataScale = range?.scale ?? 'linear';

  // Ventana seleccionada en VALORES ABSOLUTOS (fuente de verdad del usuario).
  const [win, setWin] = useState<[number, number]>([min, max]);
  const [scaleMode, setScaleMode] = useState<RangeScale>(dataScale);
  const initializedRef = useRef(false);

  // Inicializa la ventana + escala cuando llega el rango del dato. Solo una vez por métrica
  // (el componente se remonta con key={metric.id}, así el ref arranca en false).
  useEffect(() => {
    if (!initializedRef.current && range && min < max) {
      setWin([min, max]);
      setScaleMode(dataScale);
      initializedRef.current = true;
    }
  }, [min, max, dataScale, range]);

  // Reset externo (botón "Limpiar filtros"): vuelve la ventana al rango completo.
  // NO toca scaleMode para no pisar la elección de escala del usuario.
  useEffect(() => {
    if (resetSignal === undefined) return;
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

  const handleEscalaChange = (scale: string) => {
    setScaleMode(scale as RangeScale);
    onFilterChange(metric.id, null); // cambia la escala de lectura; la ventana se mantiene
  };

  const handleClear = () => {
    setWin([min, max]);
    onFilterChange(metric.id, null);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium w-[150px] truncate" title={metric.nombre_amigable}>{metric.nombre_amigable}:</span>
      <div className="min-w-[260px] max-w-[340px] flex-1">
        <Slider
          min={0}
          max={100}
          step={1}
          value={pos}
          onValueChange={handleDrag}
          onValueCommit={handleCommit}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-[11px] font-mono text-muted-foreground">
          <span>{formatCompact(min)}</span>
          <span>{isFullRange ? 'Todo el rango' : `${formatCompact(win[0])} – ${formatCompact(win[1])}`}</span>
          <span>{formatCompact(max)}</span>
        </div>
      </div>
      <Select value={scaleMode} onValueChange={handleEscalaChange}>
        <SelectTrigger className="w-[100px]"><SelectValue placeholder="Escala" /></SelectTrigger>
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
      return <ElectoralFilter key={metric.id} metric={metric} onDimensionFilterChange={updateDimensionFilter} availableParties={availableParties} availableYears={availableYears} availableVoteTypes={availableVoteTypes} />;
    }
    if (metric.tipo === TipoMetricaEnum.ECONOMICA || metric.tipo === TipoMetricaEnum.DEMOGRAFICA) {
      return <RangeFilter key={metric.id} metric={metric} range={metricRanges[metric.id]} onFilterChange={updateOrRemoveFilter} resetSignal={rangeResetSignal} />;
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
    <div className="border-b border-border bg-card relative">
      <div className="px-6 py-4 space-y-3">
        {/* Fila 1: métrica primaria (electoral) + sus filtros a la derecha */}
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
          {primaryFilter && (
            <>
              <Separator orientation="vertical" className="h-6" />
              {primaryFilter}
            </>
          )}
        </div>

        {/* Fila 2: selector de métricas secundarias + sus filtros a la derecha */}
        <div className="flex items-center gap-3">
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
          {secondaryFilters.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex flex-wrap items-center gap-3">
                {secondaryFilters.map(metric => renderMetricFilter(metric))}
              </div>
            </>
          )}
        </div>
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
            <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="h-7 text-xs">
              Limpiar filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}