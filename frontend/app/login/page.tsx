import { LandingFeatures } from "@/components/landing-features"
import { LandingHero } from "@/components/landing-hero"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="flex h-full w-full flex-row">
      {/* Banner vertical — mitad izquierda, altura completa */}
      <div className="h-full w-1/2 shrink-0">
        <LandingHero />
      </div>

      {/* Mitad derecha: features arriba, login centrado en el espacio restante */}
      <div className="flex h-full w-1/2 flex-col overflow-y-auto bg-background p-8 lg:p-10">
        <LandingFeatures />
        <div className="flex flex-1 items-center justify-center px-2 pb-4">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
