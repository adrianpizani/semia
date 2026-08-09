import { useState, useCallback } from "react"
import { toast } from "sonner"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1"

export interface Procesador {
    id: number
    nombre: string
    tipo_archivo: string
    nivel_geografico: string
    metric_name: string
    mapeo_columnas: { [key: string]: string }
}

export interface ProcesadorCreate {
    nombre: string
    tipo_archivo: string
    mapeo_columnas: { [key: string]: string }
}

export interface ProcesadorMatchRequest {
    headers: string[]
    tipo_archivo?: string
}

export const useProcessors = () => {
    const [processors, setProcessors] = useState<Procesador[]>([])
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)

    const fetchProcessors = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_BASE_URL}/procesadores/`)
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`)
            }
            const data: Procesador[] = await response.json()
            setProcessors(data)
            return data
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error desconocido al obtener procesadores."
            setError(message)
            toast.error(message)
            return []
        } finally {
            setLoading(false)
        }
    }, [])

    const createProcessor = useCallback(async (processorData: ProcesadorCreate) => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_BASE_URL}/procesadores/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(processorData),
            })
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`)
            }
            const newProcessor: Procesador = await response.json()
            setProcessors((prev) => [...prev, newProcessor])
            toast.success("Procesador creado exitosamente.")
            return newProcessor
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error desconocido al crear procesador."
            setError(message)
            toast.error(message)
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    const verifyProcessorByHeaders = useCallback(async (requestData: ProcesadorMatchRequest) => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_BASE_URL}/procesadores/verificar-encabezados`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
            })
            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(`Error ${response.status}: ${errorData.detail || response.statusText}`)
            }
            const matchedProcessor: Procesador | null = await response.json()
            return matchedProcessor
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error desconocido al verificar procesador por encabezados."
            setError(message)
            toast.error(message)
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    return {
        processors,
        loading,
        error,
        fetchProcessors,
        createProcessor,
        verifyProcessorByHeaders,
    }
}
