"use client"

import { useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { FilterBar } from "@/components/filter-bar"
import { CruceScatter } from "@/components/cruce-scatter"
import { AnalisisTable } from "@/components/analisis-table"
import { AnalisisCruceSummary } from "@/components/analisis-cruce-summary"
import { Button } from "@/components/ui/button"
import { useDashboardView } from "@/hooks/use-dashboard-view"
import {
  AnalisisSortDir,
  AnalisisSortKey,
  buildAnalisisRows,
  sortAnalisisRows,
} from "@/lib/analisis-rows"

export default function AnalisisPage() {
  const view = useDashboardView()
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<AnalisisSortKey>("share")
  const [sortDir, setSortDir] = useState<AnalisisSortDir>("desc")
  const [selectedGeografiaId, setSelectedGeografiaId] = useState<number | null>(null)

  const handleSortChange = useCallback((key: AnalisisSortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === "desc" ? "asc" : "desc"))
        return prev
      }
      setSortDir(key === "nombre" ? "asc" : "desc")
      return key
    })
  }, [])

  const handleSelect = useCallback((geografiaId: number, _nombre: string) => {
    setSelectedGeografiaId(prev => (prev === geografiaId ? null : geografiaId))
  }, [])

  const rows = useMemo(
    () => buildAnalisisRows(
      view.electoralData,
      view.secondaryMetricsData,
      view.numericSecondaries,
      view.selectedParty,
    ),
    [view.electoralData, view.secondaryMetricsData, view.numericSecondaries, view.selectedParty],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q ? rows.filter(r => r.nombre.toLowerCase().includes(q)) : rows
    return sortAnalisisRows(base, sortKey, sortDir)
  }, [rows, search, sortKey, sortDir])

  const cruceXLabel = view.numericSecondaries.find(m => m.id === view.cruceMetricId)?.nombre_amigable ?? "Métrica"
  const cruceYLabel = view.selectedParty ? `% ${view.selectedParty}` : "% del ganador"
  const cruceSecondaryData = view.cruceMetricId
    ? (view.secondaryMetricsData[view.cruceMetricId] ?? [])
    : []

  return (
    <div className="flex h-screen flex-col">
      <FilterBar
        activeMetrics={view.activeMetrics}
        selectedPrimaryMetric={view.selectedPrimaryMetric}
        onPrimaryMetricChange={view.setSelectedPrimaryMetric}
        selectedSecondaryMetrics={view.selectedSecondaryMetrics}
        onSecondaryMetricsChange={view.setSelectedSecondaryMetrics}
        filters={view.filters}
        onFiltersChange={view.handleFiltersChange}
        availableParties={view.availableParties}
        availableYears={view.availableYears}
        availableVoteTypes={view.availableVoteTypes}
        metricRanges={view.metricRanges}
        actions={
          <Button variant="outline" size="sm" className="bg-white hover:bg-white" asChild>
            <Link href="/">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Volver al mapa
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 gap-4 overflow-hidden bg-amber-50/70 p-4">
        <div className="flex min-h-0 min-w-0 flex-[3] flex-col">
          <AnalisisTable
            rows={filtered}
            numericSecondaries={view.numericSecondaries}
            selectedParty={view.selectedParty}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            search={search}
            onSearchChange={setSearch}
            selectedGeografiaId={selectedGeografiaId}
            onRowClick={handleSelect}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-[2] flex-col gap-4 overflow-y-auto">
          {view.showCruce && view.cruceMetricId && view.electoralData ? (
            <>
              <CruceScatter
                electoralData={view.electoralData}
                secondaryData={cruceSecondaryData}
                secondaryOptions={view.numericSecondaries}
                selectedSecondaryId={view.cruceMetricId}
                onSecondaryChange={view.setCruceMetricId}
                selectedParty={view.selectedParty}
                selectedGeografiaId={selectedGeografiaId}
                onPointClick={handleSelect}
                rangeFilterActive={view.cruceRangeFilterActive}
              />
              <AnalisisCruceSummary
                electoralData={view.electoralData}
                secondaryData={cruceSecondaryData}
                selectedParty={view.selectedParty}
                xLabel={cruceXLabel}
                yLabel={cruceYLabel}
                selectedGeografiaId={selectedGeografiaId}
                onPointClick={handleSelect}
                rangeFilterActive={view.cruceRangeFilterActive}
              />
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Sumá una métrica secundaria (población, PBG, etc.) para ver el cruce y su lectura.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
