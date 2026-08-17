"use client"

import { useEffect, useState } from "react"
import { getMe } from "@/lib/api"
import type { Usuario } from "@/lib/types"

export function useSession() {
  const [user, setUser] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getMe()
      .then((u) => {
        if (active) setUser(u)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { user, loading }
}