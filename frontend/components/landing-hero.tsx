import { LandingMap } from "@/components/landing-map"

/** Banner izquierdo: mapa real de municipios PBA con hover interactivo. */
export function LandingHero() {
  return (
    <div className="relative flex h-full flex-col justify-end overflow-hidden bg-[#0c1f33]">
      {/* Grilla tipo GIS */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,190,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(120,190,255,0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Gradiente atmosférico */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-[#0a1628]/80 via-[#0f2844]/50 to-[#1a4a6e]/60" />

      {/* Mapa real — municipios de la PBA */}
      <div className="absolute inset-0 z-[2]">
        <LandingMap />
      </div>

      {/* Viñeta inferior para legibilidad del texto */}
      <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-[#071018]/95 via-[#071018]/40 to-transparent" />

      <div className="relative z-10 p-8 lg:p-12">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.25em] text-sky-300/80">
          Provincia de Buenos Aires · partidos bonaerenses
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">
          sem<span className="text-sky-400">IA</span>
        </h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-sky-100/85 lg:text-lg">
          Plataforma de análisis político con visualización geográfica de datos electorales.
        </p>
      </div>
    </div>
  )
}
