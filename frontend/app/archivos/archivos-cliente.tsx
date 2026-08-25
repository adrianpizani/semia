"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Upload, File as FileIcon, Trash2, Download, Eye, Search, MoreVertical, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import Papa from "papaparse" // Importar PapaParse
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { uploadArchivo, deleteArchivo } from "@/lib/api"
import { useProcessors, Procesador, ProcesadorMatchRequest } from "@/hooks/use-processors" // Importar el hook y tipos
import { CreateProcessorModal } from "@/components/create-processor-modal" // Importar el nuevo modal

// Enums para los estados, deben coincidir con el backend
enum EstadoProcesamiento {
  PENDIENTE = "PENDIENTE",
  PROCESANDO = "PROCESANDO",
  COMPLETADO = "COMPLETADO",
  FALLIDO = "FALLIDO",
}

enum TipoMetrica {
  ELECTORAL = "ELECTORAL",
  DEMOGRAFICA = "DEMOGRAFICA",
  GEOGRAFICA = "GEOGRAFICA",
  TEMPORAL = "TEMPORAL",
  ECONOMICA = "ECONOMICA"
}

// Tipo de archivo actualizado para incluir los nuevos campos
interface ArchivoItem {
  id: number
  nombre_visible: string
  nombre_archivo_original: string
  fecha_de_carga: string
  descripcion?: string | null
  estado: EstadoProcesamiento
  log_procesamiento?: string | null
  filas_procesadas?: number | null
  filas_fallidas?: number | null
}

interface ArchivosClienteProps {
  initialFiles: ArchivoItem[]
}

// Componente para la insignia de estado
const StatusBadge: React.FC<{ file: ArchivoItem }> = ({ file }) => {
  const { estado, log_procesamiento, filas_procesadas, filas_fallidas } = file

  const handleClick = () => {
    if (!log_procesamiento) return

    const title = `Log de Procesamiento: ${file.nombre_visible}`;
    const description = (
      `<div class="text-sm text-muted-foreground">
        <p><strong>Filas Procesadas:</strong> ${filas_procesadas ?? 'N/A'}</p>
        <p><strong>Filas Fallidas:</strong> ${filas_fallidas ?? 'N/A'}</p>
        <pre class="mt-2 whitespace-pre-wrap bg-slate-100 dark:bg-slate-800 p-2 rounded-md">${log_procesamiento}</pre>
      </div>`
    );

    toast(title, { description: description, duration: 15000 });
  }

  switch (estado) {
    case EstadoProcesamiento.COMPLETADO:
      return (
        <Badge onClick={handleClick} variant="success" className="cursor-pointer">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completado
        </Badge>
      )
    case EstadoProcesamiento.FALLIDO:
      return (
        <Badge onClick={handleClick} variant="destructive" className="cursor-pointer">
          <XCircle className="mr-1 h-3 w-3" />
          Fallido
        </Badge>
      )
    case EstadoProcesamiento.PROCESANDO:
      return (
        <Badge variant="secondary" className="animate-pulse">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Procesando
        </Badge>
      )
    default:
      return (
        <Badge variant="outline">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Pendiente
        </Badge>
      )
  }
}

export function ArchivosCliente({ initialFiles }: ArchivosClienteProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<ArchivoItem | null>(null)
  const { verifyProcessorByHeaders } = useProcessors() // Usar el hook de procesadores
  const [matchedProcessor, setMatchedProcessor] = useState<Procesador | null>(null) // Para el procesador encontrado
  const [fileHeaders, setFileHeaders] = useState<string[]>([]) // Para almacenar los encabezados del archivo
  const [fileSample, setFileSample] = useState<Record<string, string>[]>([]) // Muestra de filas para detectar columnas numéricas vs strings
  const [showCreateProcessorModal, setShowCreateProcessorModal] = useState<boolean>(false) // Para controlar el modal de creación
  
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    nombre_visible: "",
    descripcion: "",
    tipo_metrica: TipoMetrica.ELECTORAL, // Valor por defecto
  })
  // Evita doble click: con CSVs grandes el POST tarda y el modal parece colgado.
  const [isUploading, setIsUploading] = useState(false)

  // Polling para actualizar el estado de los archivos en procesamiento
  useEffect(() => {
    const isProcessing = initialFiles.some(
      (file) => file.estado === EstadoProcesamiento.PROCESANDO || file.estado === EstadoProcesamiento.PENDIENTE
    )

    if (isProcessing) {
      const interval = setInterval(() => {
        console.log("Polling for file status...");
        router.refresh()
      }, 3000) // Refresca cada 3 segundos

      return () => clearInterval(interval) // Limpia el intervalo si el componente se desmonta
    }
  }, [initialFiles, router])


  const handleProcessorCreated = (newProcessor: Procesador) => {
    setMatchedProcessor(newProcessor)
    setShowCreateProcessorModal(false)
    toast.success(`Procesador '${newProcessor.nombre}' creado y seleccionado para este archivo.`)
    // El usuario ahora puede hacer clic en 'Subir Archivo' para continuar.
  }

  const handleFileUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isUploading) return

    if (!uploadForm.file) {
      toast.error("Por favor seleccione un archivo")
      return
    }
    if (!uploadForm.nombre_visible) {
      toast.error("Por favor ingrese un nombre visible")
      return
    }
    if (!matchedProcessor) {
        toast.error("Por favor, seleccione o cree un procesador antes de subir el archivo.")
        return
    }

    const formData = new FormData()
    formData.append("file", uploadForm.file)
    formData.append("nombre_visible", uploadForm.nombre_visible)
    formData.append("tipo_metrica", uploadForm.tipo_metrica)
    formData.append("processor_id", String(matchedProcessor.id)) // Usar el ID del procesador encontrado o creado
    if (uploadForm.descripcion) {
      formData.append("descripcion", uploadForm.descripcion)
    }

    setIsUploading(true)
    try {
      toast.info("Subiendo archivo… no cierres ni vuelvas a hacer clic.")
      await uploadArchivo(formData)
      toast.success("Archivo recibido. El procesamiento ha comenzado en segundo plano.")
      setUploadDialogOpen(false)
      setUploadForm({ file: null, nombre_visible: "", descripcion: "", tipo_metrica: TipoMetrica.ELECTORAL })
      setMatchedProcessor(null) // Resetear el procesador
      setFileHeaders([]) // Resetear encabezados
      setFileSample([]) // Resetear muestra
      router.refresh() // Re-fetch para mostrar el estado PENDIENTE/PROCESANDO
    } catch (error) {
      toast.error(`Error al subir: ${error instanceof Error ? error.message : "Error desconocido"}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
        setUploadForm((prev) => ({ ...prev, file: selectedFile }))
        // Leer encabezados del archivo seleccionado
        Papa.parse(selectedFile, {
            // Necesitamos una muestra de varias filas para distinguir columnas
            // numéricas de categóricas (el modal usa esto para marcar value_identifier).
            preview: 10,
            header: true, // Tratar la primera fila como encabezados
            complete: async (results) => {
                if (results.meta.fields && results.meta.fields.length > 0) {
                    setFileHeaders(results.meta.fields)
                    setFileSample((results.data || []).filter((r): r is Record<string, string> => !!r))
                    const requestData: ProcesadorMatchRequest = {
                        headers: results.meta.fields,
                        tipo_archivo: uploadForm.tipo_metrica, // Usar el tipo de métrica seleccionado actualmente
                    }
                    const processor = await verifyProcessorByHeaders(requestData)
                    if (processor) {
                        // Ya existe un procesador con este formato exacto. Igual abrimos
                        // el modal pre-cargado con su mapeo: el usuario puede crear una
                        // variante (mismo mapeo, distinto value_identifier/metric_name)
                        // para subir el mismo archivo varias veces bajo métricas diferentes.
                        setMatchedProcessor(processor)
                        toast.info(`Procesador '${processor.nombre}' encontrado. Cree una variante con otro value_identifier si lo va a usar para otra métrica.`)
                        setShowCreateProcessorModal(true)
                    } else {
                        setMatchedProcessor(null)
                        setShowCreateProcessorModal(true) // Abrir el modal para crear un nuevo procesador
                        toast.info("No se encontró un procesador compatible. Por favor, cree uno nuevo.")
                    }
                } else {
                    setFileHeaders([])
                    setFileSample([])
                    setMatchedProcessor(null)
                    toast.error("No se pudieron leer los encabezados del archivo o el archivo está vacío.")
                }
            },
            error: (error) => {
                console.error("Error parsing file for headers:", error)
                toast.error("Error al leer el archivo para extraer encabezados.")
                setFileHeaders([])
                setFileSample([])
                setMatchedProcessor(null)
            },
        })
    }
  }

  const openDeleteDialog = (file: ArchivoItem) => {
    setFileToDelete(file)
    setDeleteDialogOpen(true)
  }

  const handleDeleteFile = async () => {
    if (!fileToDelete) return

    try {
      toast.info(`Eliminando archivo ${fileToDelete.nombre_visible}...`)
      await deleteArchivo(fileToDelete.id)
      toast.success("Archivo eliminado correctamente.")
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      router.refresh() // Re-fetch para actualizar la lista
    } catch (error) {
      toast.error(`Error al eliminar: ${error instanceof Error ? error.message : "Error desconocido"}`)
    }
  }

  const filteredFiles = initialFiles.filter((file) =>
    file.nombre_visible.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Gestión de Archivos</h1>
            <p className="text-sm text-muted-foreground">Administre y visualice sus conjuntos de datos</p>
          </div>
          <Dialog
            open={uploadDialogOpen}
            onOpenChange={(open) => {
              if (isUploading) return
              setUploadDialogOpen(open)
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Subir Archivo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Subir Nuevo Archivo</DialogTitle>
                <DialogDescription>Añada un conjunto de datos para su posterior análisis.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleFileUpload} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre-visible">Nombre Visible *</Label>
                  <Input
                    id="nombre-visible"
                    placeholder="Ej: Elecciones 2023 PBA"
                    value={uploadForm.nombre_visible}
                    onChange={(e) => setUploadForm({ ...uploadForm, nombre_visible: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipo-metrica">Tipo de Métrica *</Label>
                  <Select
                    value={uploadForm.tipo_metrica}
                    onValueChange={(value) => {
                        setUploadForm({ ...uploadForm, tipo_metrica: value as TipoMetrica });
                        // Al cambiar el tipo de métrica, resetear el procesador y los encabezados
                        setMatchedProcessor(null);
                        setFileHeaders([]);
                        setFileSample([]);
                        // También cerrar el modal de creación si estuviera abierto
                        setShowCreateProcessorModal(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TipoMetrica.ELECTORAL}>Electoral</SelectItem>
                      <SelectItem value={TipoMetrica.DEMOGRAFICA}>Demográfica</SelectItem>
                      <SelectItem value={TipoMetrica.GEOGRAFICA}>Geográfica</SelectItem>
                      <SelectItem value={TipoMetrica.TEMPORAL}>Temporal</SelectItem>
                      <SelectItem value={TipoMetrica.ECONOMICA}>Economica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Encabezados y Estado del Procesador */}
                {fileHeaders.length > 0 && (
                    <div className="space-y-2">
                        <Label>Encabezados Detectados en el Archivo</Label>
                        <div className="flex flex-wrap gap-2 rounded-md border p-2">
                            {fileHeaders.map((header, index) => (
                                <Badge key={index} variant="outline">
                                    {header}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label>Estado del Procesador</Label>
                    <Input 
                        value={matchedProcessor ? `Coincidencia encontrada: ${matchedProcessor.nombre}` : "No se encontró procesador compatible"} 
                        readOnly 
                        className={matchedProcessor ? "border-green-500" : "border-amber-500"}
                    />
                    {!matchedProcessor && uploadForm.file && (
                        <Button 
                            type="button" 
                            variant="default" 
                            className="mt-2"
                            onClick={() => setShowCreateProcessorModal(true)}
                            disabled={fileHeaders.length === 0}
                        >
                            Crear Nuevo Procesador para este formato
                        </Button>
                    )}
                    {!uploadForm.file && (
                        <p className="text-sm text-muted-foreground">Seleccione un archivo para verificar el formato.</p>
                    )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    placeholder="Agregue una descripción del archivo (opcional)"
                    value={uploadForm.descripcion}
                    onChange={(e) => setUploadForm({ ...uploadForm, descripcion: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file-upload">Archivo (.csv) *</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    onChange={handleFileSelect}
                    accept=".csv"
                  />
                  {uploadForm.file && (
                    <p className="text-sm text-primary">{uploadForm.file.name} seleccionado</p>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setUploadDialogOpen(false)}
                    disabled={isUploading}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!matchedProcessor || isUploading}>
                    <Upload className="mr-2 h-4 w-4" />
                    {isUploading ? "Subiendo…" : "Subir Archivo"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Archivos Subidos</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Archivo Original</TableHead>
                    <TableHead>Fecha de Subida</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No se encontraron archivos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFiles.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <div className="font-medium">{file.nombre_visible}</div>
                          {file.descripcion && <div className="text-xs text-muted-foreground">{file.descripcion}</div>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge file={file} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{file.nombre_archivo_original}</Badge>
                        </TableCell>
                        <TableCell>{new Date(file.fecha_de_carga).toLocaleDateString("es-ES")}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => toast.info(`Visualizando ${file.nombre_visible}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver en Mapa
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toast.info("Descargando...")}>
                                <Download className="mr-2 h-4 w-4" />
                                Descargar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(file)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* New CreateProcessorModal */}
      <CreateProcessorModal
        isOpen={showCreateProcessorModal}
        onClose={() => setShowCreateProcessorModal(false)}
        fileHeaders={fileHeaders}
        fileSample={fileSample}
        tipoMetrica={uploadForm.tipo_metrica}
        initialProcessor={matchedProcessor}
        onProcessorCreated={handleProcessorCreated}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar el archivo <strong>{fileToDelete?.nombre_visible}</strong>? 
              Esta acción es irreversible y se perderán todos los datos asociados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteFile}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar Definitivamente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
