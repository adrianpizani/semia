# Multi-stage Dockerfile para el frontend (Next.js 16).
# Stage 1: build (next build)  → produce .next/standalone-friendly output
# Stage 2: runtime (next start) → imagen liviana sin devDependencies
#
# Build args (NEXT_PUBLIC_* se embeben en el bundle en build-time):
#   NEXT_PUBLIC_API_BASE_URL  → en prod va vacío (mismo origen vía nginx)

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Build args: deben declararse ANTES de cualquier instrucción que los use.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Instalar deps con la cache de Docker (package.json + lock primero).
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el resto del código y buildear.
COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Usuario no-root por seguridad.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Artefactos necesarios para `next start`.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# next.config.mjs lo lee Next al levantar el server.
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
