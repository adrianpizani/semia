"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

// Shell del layout: monta el sidebar y el main solo en las rutas de la app.
// La página de login se renderiza a pantalla completa, sin sidebar.
export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === "/login" || pathname.startsWith("/login/")

  if (isLogin) {
    return <div className="flex h-screen w-full">{children}</div>
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SidebarProvider>
  )
}