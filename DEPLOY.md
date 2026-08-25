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

1. DonWeb DNS: registro `A` de `@` (semia.studio) → `<elastic-ip>`. Sin proxy extra hasta que certbot valide.
2. Certbot (nginx Docker ocupa el 80: hay que pararlo un momento):

```bash
dig semia.studio
docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d semia.studio
sudo mkdir -p ~/semia/nginx/certs
sudo cp /etc/letsencrypt/live/semia.studio/fullchain.pem ~/semia/nginx/certs/
sudo cp /etc/letsencrypt/live/semia.studio/privkey.pem ~/semia/nginx/certs/
sudo chmod -R 755 ~/semia/nginx/certs
docker compose -f docker-compose.prod.yml start nginx
```

3. Renovación (cron):

```cron
0 3 * * * root certbot renew --quiet && cp /etc/letsencrypt/live/semia.studio/fullchain.pem /home/ubuntu/semia/nginx/certs/ && cp /etc/letsencrypt/live/semia.studio/privkey.pem /home/ubuntu/semia/nginx/certs/ && docker compose -f /home/ubuntu/semia/docker-compose.prod.yml restart nginx
```

4. Con HTTPS andando, el DNS en DonWeb ya apunta a la Elastic IP.

El `server_name` en `nginx/conf.d/semia.conf` es `semia.studio`.

---

## 6. Verificar

- `https://semia.studio` → `/login`
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

1. **CI en PRs** (`.github/workflows/ci.yml`): build frontend + import sanity backend. ✅
2. **ECR** en `sa-east-1`: repos privados `semia-backend` y `semia-frontend`. ✅
3. **OIDC** GitHub → AWS (sin access keys). Role con ECR + SSM. ⏳
4. **Deploy en push a `main`**: build en GitHub → push ECR → en EC2 `pull` + `up` vía SSM. ⏳
5. Branch protection en `main`: exigir que CI pase. ⏳

### 9.1 Compose + ECR

`docker-compose.prod.yml` declara `image: ${ECR_REGISTRY}/semia-…:${IMAGE_TAG}` y también `build:` (para generar la imagen).

En el `.env` del EC2 (y en tu máquina al pushear):

```bash
ECR_REGISTRY=590451609284.dkr.ecr.sa-east-1.amazonaws.com
IMAGE_TAG=latest
```

(Sustituí el Account ID si el tuyo es otro.)

### 9.2 Build + push manual (desde tu PC, una vez / hasta tener CD)

```bash
cd ~/Proyectos/semia
export AWS_REGION=sa-east-1
export ECR_REGISTRY=<tu-cuenta>.dkr.ecr.sa-east-1.amazonaws.com
export IMAGE_TAG=latest   # o el SHA: git rev-parse --short HEAD

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Build (usa docker-compose.prod.yml → tagea con ECR_REGISTRY)
docker compose -f docker-compose.prod.yml build backend frontend

docker push "$ECR_REGISTRY/semia-backend:$IMAGE_TAG"
docker push "$ECR_REGISTRY/semia-frontend:$IMAGE_TAG"
```

### 9.4 OIDC GitHub → AWS (sin Access Keys)

#### A) Proveedor de identidad (una vez por cuenta)

1. IAM → **Proveedores de identidad** → **Agregar proveedor**
2. Tipo: **OpenID Connect**
3. URL del proveedor: `https://token.actions.githubusercontent.com`
4. Audiencia: `sts.amazonaws.com`
5. **Agregar proveedor**

#### B) Rol para Actions: `semia-github-deploy`

1. IAM → **Roles** → **Crear rol**
2. Tipo: **Federación de identidades web** / **Web identity**
3. Proveedor: `token.actions.githubusercontent.com`
4. Audiencia: `sts.amazonaws.com`
5. Next → por ahora **sin** policies managed (las agregamos en línea)
6. Nombre: **`semia-github-deploy`** → Crear

Luego editá la **relación de confianza** del rol (Trust relationships) y dejala así  
(ajustá `ACCOUNT_ID` y el repo si hace falta):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:adrianpizani/semia:*"
        }
      }
    }
  ]
}
```

#### C) Permisos del rol (política en línea `semia-github-deploy-policy`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories"
      ],
      "Resource": [
        "arn:aws:ecr:sa-east-1:ACCOUNT_ID:repository/semia-backend",
        "arn:aws:ecr:sa-east-1:ACCOUNT_ID:repository/semia-frontend"
      ]
    },
    {
      "Sid": "SsmDeploy",
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations"
      ],
      "Resource": [
        "arn:aws:ec2:sa-east-1:ACCOUNT_ID:instance/INSTANCE_ID",
        "arn:aws:ssm:sa-east-1::document/AWS-RunShellScript",
        "arn:aws:ssm:sa-east-1:ACCOUNT_ID:*"
      ]
    }
  ]
}
```

Reemplazá `ACCOUNT_ID` e `INSTANCE_ID` (`i-…` de la EC2).

#### D) Secrets en GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → New:

| Secret | Valor |
|--------|--------|
| `AWS_DEPLOY_ROLE_ARN` | ARN del rol `semia-github-deploy` (ej. `arn:aws:iam::…:role/semia-github-deploy`) |
| `EC2_INSTANCE_ID` | `i-0abc…` de `semia-prod` |

#### E) Workflow

`.github/workflows/deploy.yml` — en cada push a `main`: build → push ECR → SSM `pull` + `up` en el EC2.

La primera vez conviene dispararlo a mano: Actions → **Deploy** → **Run workflow**.

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
