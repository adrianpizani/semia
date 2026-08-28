"use client"

/**
 * Portada demo (mapa interactivo + features). No se muestra en producción por defecto.
 * Ver README — LANDING_PREVIEW_ENABLED=true para previsualizar en /login/landing.
 */
import { useState } from "react"
import { LandingFeatures } from "@/components/landing-features"
import { LandingHero } from "@/components/landing-hero"
import { LoginForm } from "@/components/login-form"
import type { LandingDemoMode } from "@/lib/landing-demo"

export default function LoginLandingPage() {
  const [demoMode, setDemoMode] = useState<LandingDemoMode>(null)

  return (
    <div className="flex h-full w-full flex-row">
      <div className="h-full w-1/2 shrink-0">
        <LandingHero demoMode={demoMode} />
      </div>
      <div className="flex h-full w-1/2 flex-col overflow-y-auto bg-background p-8 lg:p-10">
        <LandingFeatures activeDemo={demoMode} onDemoChange={setDemoMode} />
        <div className="flex flex-1 items-center justify-center px-2 pb-4">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
