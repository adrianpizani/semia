"use client"

import { Toaster } from "sonner"

/** Notificaciones globales (sonner). Montar una sola vez en el layout raíz. */
export function AppToaster() {
  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        duration: 6000,
      }}
    />
  )
}
