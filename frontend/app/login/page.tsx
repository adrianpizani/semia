"use client"

import { useState } from "react"
import { LandingFeatures } from "@/components/landing-features"
import { LandingHero } from "@/components/landing-hero"
import { LoginForm } from "@/components/login-form"
import type { LandingDemoMode } from "@/lib/landing-demo"

export default function LoginPage() {
  const [demoMode, setDemoMode] = useState<LandingDemoMode>(null)

  return (
    <div className="flex h-full w-full flex-row">
      {/* Banner vertical — mitad izquierda, altura completa */}
      <div className="h-full w-1/2 shrink-0">
        <LandingHero demoMode={demoMode} />
      </div>

      {/* Mitad derecha: features arriba, login centrado en el espacio restante */}
      <div className="flex h-full w-1/2 flex-col overflow-y-auto bg-background p-8 lg:p-10">
        <LandingFeatures activeDemo={demoMode} onDemoChange={setDemoMode} />
        <div className="flex flex-1 items-center justify-center px-2 pb-4">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
