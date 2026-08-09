"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useProcessors, Procesador, ProcesadorCreate } from "@/hooks/use-processors"

interface CreateProcessorModalProps {
    isOpen: boolean
    onClose: () => void
    fileHeaders: string[]
    // Muestra de filas del CSV para detectar numéricas vs categóricas.
    // Si llega, marcamos visualmente las columnas numéricas (candidatas a
    // value_identifier) para que el usuario no elija una string y termine
    // con una métrica vacía.
    fileSample?: Record<string, string>[]
    tipoMetrica: string
    // Si viene un procesador que matcheó los encabezados, pre-cargamos el modal
    // con su mapeo. El usuario puede crear uno NUEVO (mismo mapeo, distinto
    // value_identifier/metric_name) para soportar subir el mismo archivo varias
    // veces bajo métricas diferentes.
    initialProcessor?: {
        nombre: string
        nivel_geografico: string
        mapeo_columnas: Record<string, string>
        metric_name: string
    } | null
    onProcessorCreated: (processor: Procesador) => void
}

// Consideramos numérica una columna si TODOS sus valores no-vacíos se pueden
// parsear como número. Una sola falla la marca como categórica. Esto es lo que
// el backend va a hacer en generic_csv_processor (con float() implícito).
function isNumericColumn(header: string, sample: Record<string, string>[]): boolean {
    if (sample.length === 0) return false;
    const values = sample.map(row => row[header]).filter(v => v != null && String(v).trim() !== "");
    if (values.length === 0) return false;
    return values.every(v => !isNaN(Number(String(v).replace(",", "."))) && !/^\s*$/.test(String(v)));
}

const NIVELES_GEOGRAFICOS = ["Circuito", "Seccion", "Partido", "Municipio"] // Opciones de niveles

export const CreateProcessorModal: React.FC<CreateProcessorModalProps> = ({
    isOpen,
    onClose,
    fileHeaders,
    fileSample = [],
    tipoMetrica,
    initialProcessor = null,
    onProcessorCreated,
}) => {
    const { createProcessor } = useProcessors()
    const [processorName, setProcessorName] = useState("")
    const [geographyIdentifierColumn, setGeographyIdentifierColumn] = useState<string>("")
    const [nivelGeografico, setNivelGeografico] = useState<string>("")
    const [valueColumn, setValueColumn] = useState<string>("") // Nuevo estado para la columna de valor
    const [metricNameInput, setMetricNameInput] = useState<string>("") // Nuevo estado para el nombre de la métrica
    const [isCreating, setIsCreating] = useState(false)

    // Set de headers que son numéricos en la muestra. Marcamos las del value_identifier
    // para evitar que el usuario elija una categórica (eso daría una métrica vacía).
    const numericHeaders = new Set(
        fileHeaders.filter(h => isNumericColumn(h, fileSample))
    );

    // Cuando el usuario eligió una columna NO numérica como value_identifier, lo
    // desaconsejamos en el submit y al abrir el selector.
    const valueColumnLooksNumeric = numericHeaders.has(valueColumn);

    // Resetear el estado cuando el modal se abre o los encabezados cambian.
    // Si hay initialProcessor (caso: el backend matcheó uno existente), pre-cargamos
    // su mapeo. El usuario solo cambia nombre, value_identifier y metric_name.
    React.useEffect(() => {
        if (!isOpen) return;

        if (initialProcessor) {
            // Caso "match encontrado": pre-cargar del procesador existente.
            // value_identifier se busca en el mapeo_columnas invirtiendo la clave.
            const valueCol = Object.entries(initialProcessor.mapeo_columnas)
                .find(([, role]) => role === "value_identifier")?.[0] ?? "";
            setProcessorName(initialProcessor.nombre)  // el usuario lo va a editar para que sea único
            setNivelGeografico(initialProcessor.nivel_geografico)
            setValueColumn(valueCol)
            setMetricNameInput(initialProcessor.metric_name)
            // Buscar la columna geografía por su mapeo (lo normal es que haya una sola).
            const geoCol = Object.entries(initialProcessor.mapeo_columnas)
                .find(([, role]) => role === "geography_identifier")?.[0] ?? "";
            setGeographyIdentifierColumn(geoCol)
            return;
        }

        // Caso "no hay match": autocompletar heurístico como antes.
        setProcessorName("")
        setGeographyIdentifierColumn("")
        setNivelGeografico("")
        setValueColumn("")
        setMetricNameInput("")

        // Intentar preseleccionar una columna geográfica y su nivel
        const defaultGeoColumn = fileHeaders.find(header =>
            header.toLowerCase().includes("circuito") ||
            header.toLowerCase().includes("seccion") ||
            header.toLowerCase().includes("partido") ||
            header.toLowerCase().includes("municipio") ||
            header.toLowerCase().includes("geografia") ||
            header.toLowerCase().includes("distrito")
        )
        if (defaultGeoColumn) {
            setGeographyIdentifierColumn(defaultGeoColumn)
            const lowerCaseHeader = defaultGeoColumn.toLowerCase()
            if (lowerCaseHeader.includes("circuito")) setNivelGeografico("Circuito")
            else if (lowerCaseHeader.includes("seccion")) setNivelGeografico("Seccion")
            else if (lowerCaseHeader.includes("partido")) setNivelGeografico("Partido")
            else if (lowerCaseHeader.includes("municipio")) setNivelGeografico("Municipio")
        }

        // Intentar preseleccionar la columna de valor
        const defaultValueColumn = fileHeaders.find(header =>
            header.toLowerCase().includes("votos") ||
            header.toLowerCase().includes("cantidad") ||
            header.toLowerCase().includes("valor") ||
            header.toLowerCase().includes("total")
        )
        if (defaultValueColumn) {
            setValueColumn(defaultValueColumn)
            // Sugerir un nombre de métrica basado en la columna de valor
            setMetricNameInput(defaultValueColumn.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()))
        }
    }, [isOpen, fileHeaders, initialProcessor])

    const handleCreate = async () => {
        if (!processorName.trim()) {
            toast.error("Por favor, ingrese un nombre para el procesador.")
            return
        }
        if (!geographyIdentifierColumn) {
            toast.error("Por favor, seleccione la columna que identifica la geografía.")
            return
        }
        if (!nivelGeografico) {
            toast.error("Por favor, seleccione el nivel geográfico.")
            return
        }
        if (!valueColumn) {
            toast.error("Por favor, seleccione la columna que contiene el valor/métrica principal.")
            return
        }
        if (!metricNameInput.trim()) {
            toast.error("Por favor, ingrese un nombre para la métrica principal.")
            return
        }

        const mappings: { [key: string]: string } = {}
        fileHeaders.forEach(header => {
            if (header === geographyIdentifierColumn) {
                mappings[header] = "geography_identifier" // Mapeo especial para la columna geográfica
            } else if (header === valueColumn) {
                mappings[header] = "value_identifier" // Mapeo especial para la columna de valor
            }
            else {
                mappings[header] = header // Mapeo 1 a 1 para el resto (dimensiones extra)
            }
        })

        setIsCreating(true)
        try {
            const processorData: ProcesadorCreate = {
                nombre: processorName.trim(),
                tipo_archivo: tipoMetrica,
                nivel_geografico: nivelGeografico,
                metric_name: metricNameInput.trim(), // Añadir el nombre de la métrica principal
                mapeo_columnas: mappings,
            }
            const newProcessor = await createProcessor(processorData)
            if (newProcessor) {
                onProcessorCreated(newProcessor)
                onClose() // Cierra el modal al tener éxito
            }
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"> {/* Ampliar ancho del modal */}
                <DialogHeader>
                    <DialogTitle>
                        {initialProcessor ? "Crear variante del procesador" : "Crear Nuevo Procesador"}
                    </DialogTitle>
                    <DialogDescription>
                        {initialProcessor
                            ? `Ya existe el procesador "${initialProcessor.nombre}" con este formato. Defina un nombre y un nombre de métrica nuevos para crear una variante (útil cuando subís el mismo archivo bajo varias métricas distintas).`
                            : "No se encontró un procesador para este formato de archivo. Defina uno nuevo."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="processor-name">Nombre del Procesador *</Label>
                        <Input
                            id="processor-name"
                            placeholder="Ej: Formato Elecciones 2023"
                            value={processorName}
                            onChange={(e) => setProcessorName(e.target.value)}
                        />
                         <p className="text-sm text-muted-foreground">
                            Asigne un nombre único para este formato de archivo.
                        </p>
                    </div>

                    {/* Selector de Columna Geográfica y Nivel */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="geo-identifier-column">Columna Geográfica *</Label>
                            <Select
                                value={geographyIdentifierColumn}
                                onValueChange={setGeographyIdentifierColumn}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar columna" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fileHeaders.map((header) => (
                                        <SelectItem key={header} value={header}>
                                            {header}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="geo-level">Nivel Geográfico *</Label>
                            <Select
                                value={nivelGeografico}
                                onValueChange={setNivelGeografico}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar nivel" />
                                </SelectTrigger>
                                <SelectContent>
                                    {NIVELES_GEOGRAFICOS.map((nivel) => (
                                        <SelectItem key={nivel} value={nivel}>
                                            {nivel}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <p className="text-sm text-muted-foreground">
                        Elija la columna que contiene el ID geográfico y su nivel.
                    </p>

                    {/* Selector de Columna de Valor/Métrica y Nombre de la Métrica */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="value-column">Columna de Valor/Métrica Principal *</Label>
                            <Select
                                value={valueColumn}
                                onValueChange={setValueColumn}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar columna de valor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fileHeaders.map((header) => {
                                        const isNumeric = numericHeaders.has(header);
                                        return (
                                            <SelectItem key={header} value={header}>
                                                <span className="flex items-center gap-2">
                                                    {header}
                                                    {isNumeric ? (
                                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">num</span>
                                                    ) : (
                                                        <span className="text-[10px] uppercase tracking-wide text-amber-600">texto</span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            {valueColumn && !valueColumnLooksNumeric && (
                                <p className="text-xs text-amber-600">
                                    ⚠ Esta columna parece de texto. Si la elegís como métrica, ningún valor se va a cargar (el procesador falla al convertir a número).
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="metric-name-input">Nombre de la Métrica Principal *</Label>
                            <Input
                                id="metric-name-input"
                                placeholder="Ej: Votos Totales"
                                value={metricNameInput}
                                onChange={(e) => setMetricNameInput(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Las columnas marcadas <strong>num</strong> son numéricas en la muestra y las únicas que tienen sentido como valor. <strong>texto</strong> = categóricas (irán como dimensión).
                    </p>

                    <div className="space-y-2">
                        <Label>Encabezados del Archivo Detectados:</Label>
                        <div className="flex flex-wrap gap-2 rounded-md border p-2">
                            {fileHeaders.map((header, index) => {
                                const isGeo = header === geographyIdentifierColumn;
                                const isVal = header === valueColumn;
                                const isNumeric = numericHeaders.has(header);
                                let variant: "default" | "secondary" | "outline" = "secondary";
                                if (isGeo || isVal) variant = "default";
                                else if (isNumeric) variant = "outline";
                                return (
                                    <Badge key={index} variant={variant}>
                                        {header}
                                        {!isGeo && !isVal && (
                                            <span className="ml-1 text-[10px] opacity-70">
                                                {isNumeric ? "num" : "texto"}
                                            </span>
                                        )}
                                    </Badge>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isCreating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? "Creando..." : "Crear y Usar Procesador"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
