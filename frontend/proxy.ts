import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"

// Debe coincidir con el SECRET_KEY del backend (backend/app/security.py).
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SECRET_KEY || "dev-secret-key-cambiar-en-produccion"
const COOKIE_NAME = "access_token"
const LOGIN_PATH = "/login"

function b64urlToBuffer(input: string): Buffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")
  return Buffer.from(padded, "base64")
}

// Valida un JWT HS256: firma HMAC-SHA256 y expiración. Sin librerías externas (Node crypto).
function tokenIsValid(token: string | undefined): boolean {
  if (!token) return false
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return false
    const [header, payload, signature] = parts

    const expected = createHmac("sha256", AUTH_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url")

    const expectedBuf = Buffer.from(expected, "base64url")
    const sigBuf = b64urlToBuffer(signature)
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
      return false
    }

    const payloadObj = JSON.parse(b64urlToBuffer(payload).toString("utf-8"))
    const now = Math.floor(Date.now() / 1000)
    if (payloadObj.exp && payloadObj.exp < now) return false
    return true
  } catch {
    return false
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPath = pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`

  const token = request.cookies.get(COOKIE_NAME)?.value
  const authed = tokenIsValid(token)

  // Si ya está logueado y pide el login, lo mandamos al dashboard.
  if (isLoginPath && authed) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Nada se ve sin login: cualquier otra ruta sin sesión válida va a /login.
  if (!isLoginPath && !authed) {
    const loginUrl = new URL(LOGIN_PATH, request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Proteger la navegación de páginas, pero dejar pasar /api/* (ese lo
    // protege el propio backend con 401) y los assets públicos.
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|geojson)$).*)",
  ],
}