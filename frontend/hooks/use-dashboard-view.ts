"use client"

import { useState, useEffect, useCallback, useMemo, SetStateAction } from "react"
import { usePathname } from "next/navigation"
import { getMetricas, getElectoralData, getGenericMetricData, getMetricOpciones, getWorkspaceConfig } from "@/lib/api"
import { decideScale } from "@/lib/range-utils"
import { Metrica, TipoMetricaEnum, GenericData, AnyFiltro, FiltroCategorico, ElectoralData } from "@/lib/types"
import { loadDashboardView, saveDashboardView } from "@/lib/dashboard-view"
import type { MapModo } from "@/hooks/use-map-view"
import { nivelForMapMode } from "@/components/map-mode-switcher"

function partiesFromElectoralData(data: ElectoralData[] | null): string[] {
  if (!data?.length) return []
  const parties = new Set<string>()
  for (const district of data) {
    for (const row of district.resultados) {
      parties.add(row.partido)
    }
  }
  return Array.from(parties).sort()
}

// Receta compartida entre dashboard y /analisis: métricas, filtros y datos.
export function useDashboardView() {
  const pathname = usePathname()
  const [activeMetrics, setActiveMetrics] = useState<Metrica[]>([])
  const [selectedPrimaryMetric, setSelectedPrimaryMetric] = useState<number | null>(null)
  const [selectedSecondaryMetrics, setSelectedSecondaryMetrics] = useState<number[]>([])
  const [filters, setFilters] = useState<AnyFiltro[]>([])
  const [electoralData, setElectoralData] = useState<ElectoralData[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [secondaryMetricsData, setSecondaryMetricsData] = useState<{ [metricId: number]: GenericData[] }>({})
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [availableVoteTypes, setAvailableVoteTypes] = useState<string[]>([])
  const [metricRanges, setMetricRanges] = useState<{ [metricId: number]: { min: number; max: number; scale: "log" | "linear" } }>({})
  const [viewReady, setViewReady] = useState(false)
  const [cruceMetricId, setCruceMetricId] = useState<number | null>(null)
  const [mapMode, setMapMode] = useState<MapModo>("pba")
  const [mapModeReady, setMapModeReady] = useState(false)

  useEffect(() => {
    const saved = loadDashboardView()
    if (saved) {
      setSelectedPrimaryMetric(saved.selectedPrimaryMetric)
      setSelectedSecondaryMetrics(saved.selectedSecondaryMetrics)
      setFilters(saved.filters)
    }
    setViewReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    setMapModeReady(false)
    const loadMapMode = async () => {
      try {
        const res = await getWorkspaceConfig()
        const defaults = (res.document.defaults as Record<string, unknown> | undefined) ?? {}
        const mapa = (defaults.mapa as Record<string, unknown> | undefined) ?? {}
        const modo = mapa.modo
        if (!cancelled && (modo === "pba" || modo === "nacional")) {
          setMapMode(modo)
        }
      } catch (error) {
        console.error("Error loading map mode:", error)
      } finally {
        if (!cancelled) setMapModeReady(true)
      }
    }
    void loadMapMode()
    return () => {
      cancelled = true
    }
  }, [pathname])

  useEffect(() => {
    if (!viewReady) return
    saveDashboardView({ selectedPrimaryMetric, selectedSecondaryMetrics, filters })
  }, [viewReady, selectedPrimaryMetric, selectedSecondaryMetrics, filters])

  useEffect(() => {
    if (!viewReady) return
    if (activeMetrics.length === 0) {
      if (selectedPrimaryMetric !== null) setSelectedPrimaryMetric(null)
      setSelectedSecondaryMetrics(prev => (prev.length ? [] : prev))
      setFilters(prev => (prev.length ? [] : prev))
      return
    }
    if (selectedPrimaryMetric !== null) {
      const primary = activeMetrics.find(m => m.id === selectedPrimaryMetric)
      if (!primary || primary.tipo !== TipoMetricaEnum.ELECTORAL) {
        setSelectedPrimaryMetric(null)
      }
    }
    const ids = new Set(activeMetrics.map(m => m.id))
    setSelectedSecondaryMetrics(prev => {
      const next = prev.filter(id => ids.has(id))
      return next.length === prev.length ? prev : next
    })
    setFilters(prev => {
      const next = prev.filter(f => ids.has(f.metrica_id))
      return next.length === prev.length ? prev : next
    })
  }, [viewReady, activeMetrics, selectedPrimaryMetric])

  useEffect(() => {
    if (!mapModeReady) return
    const fetchMetrics = async () => {
      try {
        const allMetrics = await getMetricas()
        const nivel = nivelForMapMode(mapMode)
        setActiveMetrics(
          allMetrics.filter(m => m.is_active && m.nivel_geografico === nivel)
        )
      } catch (error) {
        console.error("Error fetching active metrics:", error)
      }
    }
    fetchMetrics()
  }, [pathname, mapMode, mapModeReady])

  useEffect(() => {
    let cancelled = false
    const loadOpciones = async () => {
      if (!viewReady) return
      if (selectedPrimaryMetric === null) {
        setAvailableYears([])
        setAvailableVoteTypes([])
        return
      }
      const metricInfo = activeMetrics.find(m => m.id === selectedPrimaryMetric)
      if (metricInfo?.tipo === TipoMetricaEnum.ELECTORAL) {
        const opciones = await getMetricOpciones(selectedPrimaryMetric)
        if (!cancelled) {
          setAvailableYears(opciones.años)
          setAvailableVoteTypes(opciones.votos_tipos)
        }
      } else {
        setAvailableYears([])
        setAvailableVoteTypes([])
      }
    }
    loadOpciones()
    return () => { cancelled = true }
  }, [viewReady, selectedPrimaryMetric, activeMetrics])

  const electoralQueryKey = useMemo(
    () => JSON.stringify(
      filters.filter(f => !(f.tipo === "categoria" && f.dimension === "agrupacion_nombre"))
    ),
    [filters]
  )

  const selectedParty = useMemo(() => {
    const partyFilter = filters.find((f): f is FiltroCategorico =>
      f.tipo === "categoria"
      && f.dimension === "agrupacion_nombre"
      && f.metrica_id === selectedPrimaryMetric
    )
    return partyFilter?.valores[0] ?? null
  }, [filters, selectedPrimaryMetric])

  const availableParties = useMemo(
    () => partiesFromElectoralData(electoralData),
    [electoralData],
  )

  // Si el año/tipo cambia y el partido elegido no existe en el recorte, volver a "Ganador por distrito".
  useEffect(() => {
    if (!viewReady || selectedPrimaryMetric === null || !selectedParty) return
    if (isLoading || !electoralData) return
    if (availableParties.includes(selectedParty)) return
    setFilters(prev => prev.filter(f =>
      !(f.tipo === "categoria"
        && f.dimension === "agrupacion_nombre"
        && f.metrica_id === selectedPrimaryMetric)
    ))
  }, [viewReady, selectedPrimaryMetric, selectedParty, availableParties, electoralData, isLoading])

  useEffect(() => {
    let cancelled = false
    const fetchElectoral = async () => {
      if (!viewReady) return
      if (selectedPrimaryMetric === null) {
        setElectoralData(null)
        return
      }
      const metricInfo = activeMetrics.find(m => m.id === selectedPrimaryMetric)
      if (metricInfo?.tipo !== TipoMetricaEnum.ELECTORAL) {
        setElectoralData(null)
        return
      }
      setElectoralData(null)
      setIsLoading(true)
      try {
        const queryFilters: AnyFiltro[] = JSON.parse(electoralQueryKey)
        const data = await getElectoralData(selectedPrimaryMetric, queryFilters)
        if (!cancelled) {
          setElectoralData(data)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching electoral data:", error)
          setElectoralData(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    fetchElectoral()
    return () => { cancelled = true }
  }, [viewReady, selectedPrimaryMetric, electoralQueryKey, activeMetrics])

  useEffect(() => {
    const fetchSecondaryData = async () => {
      if (!viewReady) return
      const newSecondaryMetricsData: { [metricId: number]: GenericData[] } = { ...secondaryMetricsData }
      const metricsToFetch: number[] = []
      const currentlySelectedGenericMetrics = new Set<number>()

      for (const metricId of selectedSecondaryMetrics) {
        const metricInfo = activeMetrics.find(m => m.id === metricId)
        if (metricInfo && metricInfo.tipo !== TipoMetricaEnum.ELECTORAL) {
          currentlySelectedGenericMetrics.add(metricId)
          metricsToFetch.push(metricId)
        }
      }

      if (metricsToFetch.length > 0) {
        const ELECTORAL_DIMENSIONS = new Set(["agrupacion_nombre", "año", "votos_tipo"])
        const genericFilters = (filters ?? []).filter(f =>
          !(f.tipo === "categoria" && ELECTORAL_DIMENSIONS.has(f.dimension))
        )

        await Promise.all(metricsToFetch.map(async (metricId) => {
          try {
            const crossFiltersOnly = genericFilters.filter(f =>
              !(f.metrica_id === metricId && f.tipo === "rango")
            )
            const data = await getGenericMetricData(metricId, crossFiltersOnly)
            newSecondaryMetricsData[metricId] = data
          } catch (error) {
            console.error(`Error fetching data for secondary metric ${metricId}:`, error)
            newSecondaryMetricsData[metricId] = []
          }
        }))
      }

      const cleaned: { [metricId: number]: GenericData[] } = {}
      for (const metricId of Array.from(currentlySelectedGenericMetrics)) {
        if (newSecondaryMetricsData[metricId]) {
          cleaned[metricId] = newSecondaryMetricsData[metricId]
        }
      }

      if (JSON.stringify(cleaned) !== JSON.stringify(secondaryMetricsData)) {
        setSecondaryMetricsData(cleaned)
      }
    }

    fetchSecondaryData()
  }, [viewReady, selectedSecondaryMetrics, filters, activeMetrics])

  useEffect(() => {
    const missing = selectedSecondaryMetrics.filter(
      id => !metricRanges[id] && activeMetrics.find(m => m.id === id)
    )
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(async (metricId) => {
      try {
        const data = await getGenericMetricData(metricId, [])
        const values = data.map(d => d.valor).filter((v): v is number => v !== null && Number.isFinite(v))
        if (values.length > 0 && !cancelled) {
          const min = Math.min(...values)
          const max = Math.max(...values)
          const scale = decideScale(values)
          setMetricRanges(prev => (prev[metricId] ? prev : { ...prev, [metricId]: { min, max, scale } }))
        }
      } catch (error) {
        console.error(`Error fetching range for metric ${metricId}:`, error)
      }
    }))
    return () => { cancelled = true }
  }, [selectedSecondaryMetrics, metricRanges, activeMetrics])

  const handleFiltersChange = useCallback((updater: SetStateAction<AnyFiltro[]>) => {
    setFilters(updater)
  }, [])

  const numericSecondaries = useMemo(() => (
    selectedSecondaryMetrics
      .map(id => activeMetrics.find(m => m.id === id))
      .filter((m): m is Metrica =>
        !!m &&
        (m.tipo === TipoMetricaEnum.ECONOMICA ||
          m.tipo === TipoMetricaEnum.DEMOGRAFICA ||
          m.tipo === TipoMetricaEnum.PRENSA) &&
        (m.mostrar_cruce !== false)
      )
  ), [selectedSecondaryMetrics, activeMetrics])

  const hotspotSecondaries = useMemo(() => (
    selectedSecondaryMetrics
      .map(id => activeMetrics.find(m => m.id === id))
      .filter((m): m is Metrica => !!m && m.mostrar_hotspots === true)
  ), [selectedSecondaryMetrics, activeMetrics])

  useEffect(() => {
    if (numericSecondaries.length === 0) {
      setCruceMetricId(null)
      return
    }
    setCruceMetricId(prev =>
      prev !== null && numericSecondaries.some(m => m.id === prev)
        ? prev
        : numericSecondaries[0].id
    )
  }, [numericSecondaries])

  const primaryIsElectoral = activeMetrics.find(m => m.id === selectedPrimaryMetric)?.tipo === TipoMetricaEnum.ELECTORAL
  const showCruce = Boolean(primaryIsElectoral && electoralData && cruceMetricId && numericSecondaries.length > 0)
  const cruceRangeFilterActive = Boolean(
    cruceMetricId && filters.some(f => f.tipo === "rango" && f.metrica_id === cruceMetricId)
  )

  return {
    viewReady,
    activeMetrics,
    selectedPrimaryMetric,
    setSelectedPrimaryMetric,
    selectedSecondaryMetrics,
    setSelectedSecondaryMetrics,
    filters,
    handleFiltersChange,
    electoralData,
    isLoading,
    secondaryMetricsData,
    availableParties,
    availableYears,
    availableVoteTypes,
    metricRanges,
    selectedParty,
    numericSecondaries,
    hotspotSecondaries,
    cruceMetricId,
    setCruceMetricId,
    primaryIsElectoral,
    showCruce,
    cruceRangeFilterActive,
    electoralQueryKey,
    mapMode,
  }
}

