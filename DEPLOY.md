# Deploy — AWS

Plan y runbook para el **primer deploy** de Semia. Auth, Alembic y las imágenes de producción ya están en el repo. Lo que falta es la infra en AWS y, después, CI/CD.

Orden: **EC2 manual → HTTPS → seed → backups → CI en PRs → deploy automático**.

Documentación de producto y arranque local: [`README.md`](./README.md). Bitácora: [`AVANCE.md`](./AVANCE.md).

---

## Estado

### Ya está en el repo

- `frontend/Dockerfile` multi-stage (`next build` → `next start`)
- `backend/Dockerfile` con workers, Alembic, GeoJSON de seed y entrypoint (`alembic upgrade head` antes de uvicorn)
- `docker-compose.prod.yml` sin bind-mounts de código, `COOKIE_SECURE=true`, volumen `postgres_data`
- `nginx/nginx.prod.conf` + `nginx/conf.d/semia.conf` (80 → 443, `/api/` → backend, `/` → frontend, uploads 300 MB)
- `.env.example` y `.gitignore` (`.env`, `nginx/certs/`, `*.pem`)

### Próximo objetivo

Un EC2 con el stack de prod, HTTPS y login funcionando. CI/CD viene después, cuando el ciclo manual esté claro.

---

## Decisiones

| Tema | Elección | Por qué |
|------|----------|---------|
| Región | `sa-east-1` (São Paulo) | Latencia OK para AR, free tier |
| Instancia | `t3.micro` (1 GB) | Free tier. **No buildear Next en el EC2** (1 GB no alcanza) |
| Base | Postgres+PostGIS **en Docker en el EC2** | RDS free tier no deja `CREATE EXTENSION postgis` |
| DNS | Cloudflare (free) | Proxy + oculta la IP |
| TLS | Let's Encrypt + certbot | Gratis, renovable |
| Secrets | `.env` en el EC2 (`chmod 600`) | Simple; Secrets Manager cuando crezca |
| CI runner | GitHub-hosted | No contamina el EC2 con builds |

Si el password de Postgres tiene `@`, `:`, `%` u otros caracteres raros, hay que URL-encodearlo en `DATABASE_URL`. `SECRET_KEY` y `AUTH_SECRET` **tienen que ser el mismo valor**.

---

## 1. EC2

1. Launch Instance: Ubuntu 22.04 LTS, **t3.micro**, 30 GB gp3.
2. Security group inbound: SSH (22) solo tu IP; HTTP (80) y HTTPS (443) `0.0.0.0/0`.
3. Key pair: `semia-key.pem` (`chmod 400` en tu máquina).
4. Elastic IP (que no cambie al reiniciar).

```bash
ssh -i ~/.ssh/semia-key.pem ubuntu@<elastic-ip>

sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 certbot
sudo usermod -aG docker ubuntu
newgrp docker
```

No instales nginx en el host: el de Docker es el que sirve 80/443.

---

## 2. Repo y `.env`

```bash
cd ~
git clone https://github.com/<usuario>/semia.git
cd semia
cp .env.example .env
chmod 600 .env
nano .env
```

En prod, como mínimo:

```bash
POSTGRES_USER=semia
POSTGRES_PASSWORD=<fuerte>
POSTGRES_DB=pba_dashboard
DATABASE_URL=postgresql+asyncpg://semia:<fuerte>@db:5432/pba_dashboard
SECRET_KEY=$(openssl rand -hex 32)
AUTH_SECRET=<el mismo que SECRET_KEY>
ADMIN_EMAIL=admin@semia.studio
ADMIN_PASSWORD=<cambiar el default>
```

`COOKIE_SECURE` lo fuerza `docker-compose.prod.yml` a `true`.  
`EmailStr` rechaza dominios `.local`: el admin tiene que ser un mail con dominio real (`admin@semia.studio`).

---

## 3. Levantar

**Ojo:** no buildear el frontend en el t3.micro. Opciones: buildear las imágenes en otra máquina / GitHub Actions y llevarlas, o usar una instancia más grande solo para el primer `--build`.

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

En los logs del backend tiene que aparecer `[entrypoint] alembic upgrade head` y después `Application startup complete`. Volumen vacío → crea las 6 tablas.

Volumen viejo (era `create_all`, `alembic_version` vacío):

```bash
docker compose -f docker-compose.prod.yml exec backend alembic stamp head
```

GeoJSON y Alembic van **dentro de la imagen**. No hace falta montar `frontend/public`.

---

## 4. Seed

Una vez, sobre DB vacía:

```bash
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.import_geojson
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.import_circuitos
docker compose -f docker-compose.prod.yml exec -e PYTHONPATH=/ backend python -m app.scripts.create_admin
```

`PYTHONPATH=/` hace que `/app` sea el paquete `app` (los scripts viven en `/app/scripts/`).

---

## 5. DNS + TLS

Antes de apuntar el DNS, nginx de prod **exige** `nginx/certs/fullchain.pem` y `privkey.pem`. Para probar en local alcanza un cert self-signed (la carpeta está en `.gitignore`).

1. Cloudflare: sitio nuevo, nameservers, registro `A app.semia.studio <elastic-ip>` con proxy **gris** (DNS only) hasta que certbot valide.
2. Certbot (nginx Docker ocupa el 80: hay que pararlo un momento):

```bash
dig app.semia.studio
docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d app.semia.studio
sudo mkdir -p ~/semia/nginx/certs
sudo cp /etc/letsencrypt/live/app.semia.studio/fullchain.pem ~/semia/nginx/certs/
sudo cp /etc/letsencrypt/live/app.semia.studio/privkey.pem ~/semia/nginx/certs/
sudo chmod -R 755 ~/semia/nginx/certs
docker compose -f docker-compose.prod.yml start nginx
```

3. Renovación (cron):

```cron
0 3 * * * root certbot renew --quiet && cp /etc/letsencrypt/live/app.semia.studio/fullchain.pem /home/ubuntu/semia/nginx/certs/ && cp /etc/letsencrypt/live/app.semia.studio/privkey.pem /home/ubuntu/semia/nginx/certs/ && docker compose -f /home/ubuntu/semia/docker-compose.prod.yml restart nginx
```

4. Con HTTPS andando, activar el proxy naranja de Cloudflare.

El `server_name` en `nginx/conf.d/semia.conf` es `app.semia.studio`.

---

## 6. Verificar

- `https://app.semia.studio` → `/login`
- Login con el admin del `.env`
- Subir un CSV chico y ver el mapa

`COOKIE_SECURE=true` implica que el login **no** guarda cookie por HTTP. En local, probar prod compose por `https://localhost` (aceptar el cert self-signed).

---

## 7. Backups

El compose de prod **no** fija `container_name`. El dump tiene que usar el nombre que asigne Compose (por ejemplo `semia-db-1`), o el ID:

```bash
mkdir -p ~/backups
docker compose -f ~/semia/docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > ~/backups/semia-$(date +%F).sql.gz
```

Cron (ajustá usuario/DB):

```cron
0 2 * * * ubuntu cd /home/ubuntu/semia && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U semia pba_dashboard | gzip > /home/ubuntu/backups/semia-$(date +\%F).sql.gz && find /home/ubuntu/backups -mtime +7 -delete
```

Cuando crezca: copiar a S3 con lifecycle de 30 días.

---

## 8. Actualizar el servidor (ciclo manual)

```bash
cd ~/semia
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

El entrypoint vuelve a correr `alembic upgrade head` (no-op si no hay revisiones nuevas). No hace falta re-sembrar geografía.

---

## 9. Después del primer deploy: CI/CD

Cuando el ciclo de arriba esté estable:

1. **CI en PRs** (`.github/workflows/ci.yml`): lint/build frontend; sanity import del backend. Tests cuando existan (`pytest` / `npm test`).
2. **ECR** en `sa-east-1`: `semia-backend`, `semia-frontend`.
3. **OIDC** GitHub → AWS (sin access keys). Role con ECR + SSM.
4. **Deploy en push a `main`**: build en GitHub (no en el t3.micro), push a ECR, `docker compose pull` + `up` en el EC2 vía SSM.
5. Branch protection en `main`: exigir que CI pase.

No hay workflows en el repo todavía. El primer deploy es a mano a propósito.

---

## Antes de cortar a producción

- [x] Unificar cliente API: `use-processors.ts` usa `/api/v1` relativo (igual que `lib/api.ts`). `""` ya no cae a `localhost:8000`.
- [x] Uvicorn en 2 workers (`UVICORN_WORKERS`, default 2).
- [ ] Sacar `console.log` / `print("--- DEPURANDO ---")` de `use-map-view.ts`, `page.tsx` y `generic_csv_processor.py`.
- [ ] `SECRET_KEY` = `AUTH_SECRET`, passwords fuertes, admin distinto del default.
- [ ] `server_name` de nginx = dominio real.
- [ ] No buildear Next en el t3.micro.

---

## Checklist de cierre

- [ ] HTTPS + renovación de cert
- [ ] Login en el dominio real
- [ ] Upload CSV chico + mapa con datos
- [ ] Backup diario de Postgres (archivo `.sql.gz` en disco)
- [ ] Logs: `docker compose -f docker-compose.prod.yml logs -f backend`
- [ ] Anotar en `AVANCE.md` IP/dominio y lo que se hizo
