import { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Map, Table2 } from "lucide-react"

type FeedShellProps = {
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
}

/** Shell compartido para las vistas mock de feeds (Social / Web / IA). */
export function FeedShell({ title, description, children, actions }: FeedShellProps) {
  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15">
                Próximamente · demo
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button variant="outline" size="sm" className="bg-white hover:bg-white" asChild>
              <Link href="/">
                <Map className="mr-1 h-4 w-4" />
                Ver en mapa
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="bg-white hover:bg-white" asChild>
              <Link href="/analisis">
                <Table2 className="mr-1 h-4 w-4" />
                Ver análisis
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-7xl space-y-4">{children}</div>
      </div>
    </div>
  )
}
