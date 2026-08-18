# DEPLOY — Plan de deploy en AWS + CI/CD

Documento ejecutable para llevar WALICHO a AWS (free tier) y automatizar despliegues con GitHub Actions. Asume que la Etapa 3.1 (autenticación) ya está cerrada — ver `AVANCE.md`.

Orden de ejecución recomendado: **Docker prod-ready → EC2 manual → CI en PRs → Deploy automático**.

---

## 0. Decisiones previas (definir antes de empezar)

| Decisión | Recomendación | Por qué |
|----------|--------------|---------|
| Región AWS | `sa-east-1` (São Paulo) | Latencia razonable para público AR, free tier disponible |
| Tipo de EC2 | `t3.micro` (1 GB RAM) o `t2.micro` | Free tier elegible. **No buildear Next en el EC2** (1 GB no alcanza) |
| Base de datos | **Postgres+PostGIS en contenedor dentro del EC2** (igual que dev) | RDS free tier NO habilita PostGIS sin rol `rds_superuser`. Migrar a RDS cuando crezca la base |
| DNS | Cloudflare (free) | Proxy + TLS gratis, oculta la IP del EC2 |
| TLS | Let's Encrypt + Certbot | Gratis, renovación automática |
| Secrets | `.env` en el EC2 (chmod 600) al principio; AWS Secrets Manager cuando crezca | Empezar simple, no过早 optimar |
| Runner CI/CD | GitHub-hosted (no self-hosted) | No contamina el EC2 con builds |

**Por qué no RDS en free tier:** la instancia `db.t3.micro` free tier asigna un rol sin permisos para `CREATE EXTENSION postgis`, y PostGIS es parte del modelo (geometry en `dimension_geografica`). La opción es dejar Postgres como contenedor Docker en el EC2 con un volumen EBS persistente, que es lo que ya hace dev — solo hay que ajustar el `docker-compose.prod.yml` para usar un volumen con nombre (no bind-mount del host).

---

## 1. Producción-ready del Docker (Etapa 3.3.1 de AVANCE.md)

El `docker-compose.yml` actual sirve para dev pero no para cloud. Hay que crear archivos separados para prod.

### 1.1 — `frontend/Dockerfile` (multi-stage)

```dockerfile
# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Las vars NEXT_PUBLIC_* se embeben en el bundle, deben venir como build args
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]
```

**Punto crítico:** `BACKEND_URL` (interno de Docker) y `NEXT_PUBLIC_API_BASE_URL` (público, embebido). En prod, el frontend habla con el backend vía **nginx reverse proxy** en el mismo origen, así que `NEXT_PUBLIC_API_BASE_URL=""` y las llamadas a `/api/*` se resuelven vía rewrites de Next.

### 1.2 — `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema (psycopg/asyncpg, geos para GeoAlchemy2 si hace falta)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 4 workers para un t3.micro; ajustar según RAM disponible
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 1.3 — `docker-compose.prod.yml` (nuevo archivo, no reemplazar dev)

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    networks:
      - walicho

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      SECRET_KEY: ${SECRET_KEY}
      AUTH_SECRET: ${AUTH_SECRET}
      COOKIE_SECURE: "true"
      ACCESS_TOKEN_EXPIRE_MINUTES: "1440"
    depends_on:
      db:
        condition: service_healthy
    expose:
      - "8000"
    restart: always
    networks:
      - walicho

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_BASE_URL: ""
    environment:
      BACKEND_URL: http://backend:8000
      AUTH_SECRET: ${AUTH_SECRET}
    depends_on:
      - backend
    expose:
      - "3000"
    restart: always
    networks:
      - walicho

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - frontend
      - backend
    restart: always
    networks:
      - walicho

volumes:
  postgres_data:

networks:
  walicho:
    driver: bridge
```

**Notas:**
- **No hay bind-mounts** (`./backend/app:/app` etc.) — el código va embebido en la imagen.
- **`postgres_data`** es un volumen con nombre (no bind-mount), sobrevive a `docker compose down`.
- **Nginx expone 80/443 al host**, frontend y backend quedan en la red interna solo con `expose`.
- **`COOKIE_SECURE=true`** es obligatorio detrás de HTTPS.

### 1.4 — `nginx/nginx.prod.conf` y `nginx/conf.d/walicho.conf`

El `nginx.conf` actual (dev) sirve como base. Cambios para prod:

```nginx
# nginx/conf.d/walicho.conf
server {
    listen 80;
    server_name app.walicho.com;  # tu dominio real

    # Redirigir todo a HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name app.walicho.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Uploads grandes (95 MB CSV electoral)
    client_max_body_size 300m;

    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # API
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;  # CSVs grandes tardan
    }
}
```

Los certificados se montan en `/etc/nginx/certs/` (gestionados por certbot fuera de Docker — ver sección 2.6).

### 1.5 — `.env.example` ya existe; verificar que contenga

```bash
# Postgres
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=walicho

# Backend
DATABASE_URL=postgresql+asyncpg://walicho:CHANGEME@db:5432/walicho
SECRET_KEY=         # jwt signing key — `openssl rand -hex 32`
AUTH_SECRET=        # debe coincidir con SECRET_KEY
COOKIE_SECURE=true
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Frontend
BACKEND_URL=http://backend:8000   # interno Docker
NEXT_PUBLIC_API_BASE_URL=         # vacío en prod (mismo origen vía nginx)
```

�️ `EmailStr` rechaza dominios `.local` (anotado en AVANCE.md). El admin debe usar dominio real: `admin@walicho.com`.

### 1.6 — `.gitignore` (verificar)

```
.env
.env.production
*.pem
nginx/certs/
```

---

## 2. Deploy manual en AWS (Etapa 3.2)

Objetivo: **aprender el ciclo antes de automatizarlo**. Después se reemplaza este flujo por GitHub Actions.

### 2.1 — Crear EC2

1. AWS Console → EC2 → **Launch Instance**.
2. AMI: **Ubuntu 22.04 LTS** (free tier).
3. Tipo: **t3.micro** (1 GB RAM, free tier elegible).
4. Storage: 30 GB gp3 (free tier incluye hasta 30 GB).
5. Security Group inbound:
   - SSH (22) → solo tu IP
   - HTTP (80) → 0.0.0.0/0
   - HTTPS (443) → 0.0.0.0/0
6. Key pair: crear/descargar `walicho-key.pem` (`chmod 400` localmente).
7. Asignar **Elastic IP** (para que la IP pública no cambie al reiniciar).

### 2.2 — Setup inicial del EC2

Conectarse:

```bash
ssh -i ~/.ssh/walicho-key.pem ubuntu@<elastic-ip>
```

Instalar Docker:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo usermod -aG docker ubuntu
newgrp docker
docker --version
```

### 2.3 — Clonar repo y configurar `.env`

```bash
cd ~
git clone https://github.com/<usuario>/walicho.git
cd walicho
cp .env.example .env
nano .env   # completar SECRET_KEY, AUTH_SECRET, passwords, etc.
chmod 600 .env
```

Generar `SECRET_KEY`:

```bash
openssl rand -hex 32
```

### 2.4 — Levantar stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

El entrypoint del backend corre `alembic upgrade head` **antes** de uvicorn. En un volumen de Postgres vacío (EC2 nuevo) eso crea las 6 tablas. En los logs deberías ver `[entrypoint] alembic upgrade head` y después `Application startup complete`.

**Si el volumen ya tiene tablas de la era `create_all`** (alembic_version vacío), `upgrade` falla con `relation "usuarios" already exists`. En ese caso stampear en vez de recrear:

```bash
docker compose -f docker-compose.prod.yml exec backend alembic stamp head
```

### 2.5 — Seed inicial

Los GeoJSON de geografía van embebidos en la imagen del backend (`backend/static/` → `/app/static/`). El schema ya lo aplicó el entrypoint en el paso 2.4.

`PYTHONPATH=/` hace que `/app` sea el paquete `app` (los scripts viven en `/app/scripts/` y usan imports relativos `from ..database`).

```bash
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.import_geojson
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.import_circuitos
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.create_admin
# admin@walicho.com / admin123 (override via ADMIN_EMAIL / ADMIN_PASSWORD)
```

### 2.6 — DNS + TLS

1. **Cloudflare** (free): agregar sitio → cambiar nameservers → en DNS agregar registro `A app.walicho.com <elastic-ip>` con proxy **DNS only** (gris, no naranja) en este paso porque necesitamos que certbot llegue al EC2 para validar el cert.
2. **Let's Encrypt** vía certbot en el EC2:

   ```bash
   # Apuntar DNS primero (propagación puede tardar minutos)
   dig app.walicho.com

   # Certbot standalone (nginx corre en Docker, así que paramos el container para liberar 80)
   docker compose -f docker-compose.prod.yml stop nginx
   sudo certbot certonly --standalone -d app.walicho.com
   # Responder al challenge HTTP-01
   docker compose -f docker-compose.prod.yml start nginx
   ```

3. **Montar certs en nginx** (vía volumen en `docker-compose.prod.yml`, carpeta `nginx/certs/`):

   ```bash
   sudo mkdir -p ~/walicho/nginx/certs
   sudo cp /etc/letsencrypt/live/app.walicho.com/fullchain.pem ~/walicho/nginx/certs/
   sudo cp /etc/letsencrypt/live/app.walicho.com/privkey.pem ~/walicho/nginx/certs/
   sudo chmod -R 755 ~/walicho/nginx/certs
   ```

4. **Renovación automática** (certbot renueva cada 60 días; dejar el timer default o un cron):

   ```bash
   # Script de renovación que copia certs al directorio montado por nginx
   sudo nano /etc/cron.d/certbot-renew
   ```

   ```cron
   0 3 * * * root certbot renew --quiet && cp /etc/letsencrypt/live/app.walicho.com/fullchain.pem /home/ubuntu/walicho/nginx/certs/ && cp /etc/letsencrypt/live/app.walicho.com/privkey.pem /home/ubuntu/walicho/nginx/certs/ && docker compose -f /home/ubuntu/walicho/docker-compose.prod.yml restart nginx
   ```

5. Una vez emitido el cert y nginx sirviendo HTTPS: **activar el proxy de Cloudflare** (naranja) para ocultar la IP del EC2.

### 2.7 — Verificación manual

- Abrir `https://app.walicho.com` → debe redirigir a `/login`.
- Loguear con `admin@walicho.com` / `admin123`.
- Subir un CSV chico y verificar que el mapa renderiza.

### 2.8 — Backups manuales (Postgres en EC2)

```bash
# Dump diario, retenido 7 días
sudo nano /etc/cron.d/pg-backup
```

```cron
0 2 * * * ubuntu cd /home/ubuntu/walicho && docker exec pba_db pg_dump -U walicho walicho | gzip > /home/ubuntu/backups/walicho-$(date +\%F).sql.gz && find /home/ubuntu/backups -mtime +7 -delete
```

Para backups off-site (recomendado cuando crezca): `aws s3 cp` a un bucket S3 con lifecycle policy de 30 días.

---

## 3. CI/CD con GitHub Actions (Etapa 3.3)

Dos workflows separados: **CI en PRs** (rápido, no deploya) y **Deploy en `main`** (build + push + deploy).

### 3.1 — Estructura

```
.github/
├── workflows/
│   ├── ci.yml
│   └── deploy.yml
```

### 3.2 — `ci.yml` (corre en PRs y push a main)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_USER: walicho
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: walicho_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U walicho"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: backend/requirements.txt
      - name: Install deps
        run: |
          pip install -r requirements.txt
      - name: Verify backend builds
        run: python -c "import app.main"  # sanity check

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
        env:
          NEXT_PUBLIC_API_BASE_URL: ""
```

**Nota sobre tests:** `AVANCE.md` dice que no hay tests todavía. Cuando se agreguen, sumar un step `pytest` (backend) y `npm test` (frontend) en cada job.

### 3.3 — ECR (Elastic Container Registry)

Crear dos repos en ECR (región `sa-east-1`):

- `walicho-backend`
- `walicho-frontend`

Settings → Private repository → Create.

### 3.4 — OIDC para AWS (recomendado, evita access keys)

1. IAM → Identity providers → Add provider → GitHub OIDC.
2. IAM Role `GitHubActionsDeploy` con trust policy para tu repo (audience `sts.amazonaws.com`, condition `repo=<org>/<repo>:ref:refs/heads/main`).
3. Permisos del role: `AmazonECR-PowerUser`, `AmazonSSMFullAccess` (o un policy custom más restringido si preferís).

### 3.5 — `deploy.yml` (solo en push a main)

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:  # para deploys manuales desde GitHub UI

concurrency:
  group: deploy
  cancel-in-progress: false  # no cortar un deploy a mitad

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    strategy:
      matrix:
        service: [backend, frontend]
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: sa-east-1

      - name: Login to ECR
        uses: aws-actions/docker-login@v2

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./${{ matrix.service }}
          push: true
          tags: |
            ${{ steps.ecr.outputs.registry }}/walicho-${{ matrix.service }}:${{ github.sha }}
            ${{ steps.ecr.outputs.registry }}/walicho-${{ matrix.service }}:latest
          cache-from: type=registry,ref=${{ steps.ecr.outputs.registry }}/walicho-${{ matrix.service }}:buildcache
          # Build args solo aplican al frontend
          build-args: |
            ${{ matrix.service == 'frontend' && 'NEXT_PUBLIC_API_BASE_URL=' || '' }}
```

⚠️ La sintaxis exacta del `matrix` con build-args condicionales es fea en GitHub Actions; alternativa más simple: **dos jobs separados** (uno `build-backend`, otro `build-frontend`) sin matrix. Más verboso pero más legible.

### 3.6 — Deploy al EC2

Opción recomendada: **AWS Systems Manager (SSM) Run Command** — no expone el EC2 por SSH.

Agregar job al `deploy.yml`:

```yaml
  deploy:
    runs-on: ubuntu-latest
    needs: build-and-push
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: sa-east-1

      - name: Pull and restart services
        uses: aws-actions/aws-ssm@v1
        with:
          command: |
            cd /home/ubuntu/walicho && \
            export AWS_DEFAULT_REGION=sa-east-1 && \
            aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.sa-east-1.amazonaws.com && \
            docker compose -f docker-compose.prod.yml pull backend frontend && \
            docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps backend frontend && \
            docker image prune -f
        instanceIds: ${{ secrets.EC2_INSTANCE_ID }}

      - name: Healthcheck
        run: |
          sleep 15
          curl -sf https://app.walicho.com/api/v1/metricas -H "Cookie: access_token=fake" || true
          # 401 es OK (proba que el backend responde); 5xx es fail
```

### 3.7 — Secrets de GitHub (en repo Settings → Secrets)

- `AWS_ROLE_ARN` — ARN del IAM Role con permisos ECR + SSM.
- `EC2_INSTANCE_ID` — `i-0123456789abcdef0`.

**No** commitear:
- `DATABASE_URL` real, `SECRET_KEY`, `POSTGRES_PASSWORD` → viven en `.env` del EC2, leídos por docker-compose desde el filesystem.
- AWS access keys (usamos OIDC).

### 3.8 — Branch protection en GitHub

Settings → Branches → Branch protection rules → `main`:
- ✅ Require status checks to pass before merging: `CI / backend`, `CI / frontend`.
- ✅ Require linear history (opcional).

---

## 4. Pendientes que conviene resolver antes de empezar

Del propio `AVANCE.md`:

1. **Unificar API client dual strategy** — `lib/api.ts` (rewrites) vs `use-processors.ts` (directo). En prod todo debe ir por rewrites del mismo origen, sino debug de cookies cross-origin. Hacer antes del primer deploy.
2. **Decidir `EmailStr` vs `Email`** — el admin default `admin@walicho.local` falla la validación. Cambiar a `admin@walicho.com` antes del seed.
3. **Migraciones formales (Alembic)** — hecho. El schema lo aplica el entrypoint (`alembic upgrade head`). No volver a `create_all`. Si un volumen viejo ya tiene tablas, `alembic stamp head`.
4. **Quitar `console.log` y `print("--- DEPURANDO ---")`** — anotado como pendiente pre-demo. Mejor antes de deploy, sino quedan en logs de prod.

---

## 5. Orden de ejecución recomendado

| # | Tarea | Esfuerzo | Bloquea a |
|---|-------|----------|-----------|
| 1 | Sección 1: Dockerfiles + `docker-compose.prod.yml` + nginx.prod.conf | 1 sesión | todo lo demás |
| 2 | Sección 1.5: completar `.env.example` y verificar `.gitignore` | 30 min | paso 3 |
| 3 | Sección 2.1-2.2: crear EC2 + setup Docker | 30 min | paso 4 |
| 4 | Sección 2.3-2.5: clonar, `.env`, levantar stack, seed | 1 h | paso 5 |
| 5 | Sección 2.6-2.7: DNS + TLS + verificación manual | 1 h | paso 6 |
| 6 | Sección 2.8: backups programados | 30 min | — |
| 7 | Sección 3.2: `ci.yml` (CI en PRs) | 1 h | paso 9 |
| 8 | Sección 3.3-3.5: ECR + OIDC + `deploy.yml` | 2 h | paso 9 |
| 9 | Sección 3.7-3.8: secrets + branch protection | 30 min | cierre |

Total estimado: **~1.5-2 sesiones** para tener deploy manual funcionando, **+1.5 sesiones** para CI/CD cerrado.

---

## 6. Checklist de cierre (todo verde antes de dar por terminada la etapa)

- [ ] HTTPS funciona, cert renovable.
- [ ] Login funciona desde `https://app.walicho.com`.
- [ ] Subida de un CSV chico completa end-to-end.
- [ ] Mapa renderiza con datos reales.
- [ ] PR a `main` sin mergeo si CI falla.
- [ ] Push a `main` → deploy automático completa en <5 min.
- [ ] Backup diario de Postgres corriendo (verificar archivo .sql.gz).
- [ ] Logs accesibles: `docker compose -f docker-compose.prod.yml logs -f backend`.
- [ ] Documentar en `AVANCE.md` el resultado (cambios hechos, links a la infra).

---

## Referencias

- `AVANCE.md` — Etapas 3.2, 3.3 y checklist 3.3.1.
- `CLAUDE.md` — comandos básicos del stack.
- `README.md` — brief del producto.
