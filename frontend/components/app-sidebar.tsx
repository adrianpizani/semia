"use client"

import { Home, Settings, Upload, TrendingUp, LogOut, ShieldCheck, Table2 } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useSession } from "@/hooks/use-session"
import { logout } from "@/lib/api"

const menuItems = [
  { title: "Mapa", url: "/", icon: Home },
  { title: "Análisis", url: "/analisis", icon: Table2 },
]

// Acciones de administración: solo visibles para usuarios con rol "admin".
const adminItems = [
  { title: "Gestión de Archivos", url: "/archivos", icon: Upload },
  { title: "Métricas", url: "/metricas", icon: TrendingUp },
  { title: "Configuración", url: "/configuracion", icon: Settings },
]

export function AppSidebar() {
  const { user } = useSession()
  const isAdmin = user?.rol === "admin"
  const displayName = user?.nombre || user?.email?.split("@")[0] || "Usuario"

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Análisis Electoral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <Badge variant="secondary" className="text-[10px]">
                {user?.rol === "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                {user?.rol}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Cerrar sesión"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
