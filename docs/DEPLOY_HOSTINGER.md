# Deploy — Hostinger VPS (convivencia con panel Apache)

El VPS ya sirve **`panel.viracomunicacion.com`** con Apache en 80/443 (`/var/www/semia`).  
Semia (esta app) va en Docker y **no** ocupa esos puertos.

```
Internet → Apache :443 (semia.studio) → 127.0.0.1:8080 → nginx Docker → frontend/backend
         → Apache :443 (panel.…)     → /var/www/semia   (no tocar)
```

## 1. Repo y `.env`

```bash
cd /opt/semia-app   # path real del clone
cp .env.example .env
chmod 600 .env
```

Mínimo en `.env`:

```bash
POSTGRES_USER=semia
POSTGRES_PASSWORD=<fuerte>
POSTGRES_DB=pba_dashboard
DATABASE_URL=postgresql+asyncpg://semia:<fuerte>@db:5432/pba_dashboard
SECRET_KEY=<openssl rand -hex 32>
AUTH_SECRET=<el mismo que SECRET_KEY>
ADMIN_EMAIL=admin@semia.studio
ADMIN_PASSWORD=<cambiar>
ECR_REGISTRY=semia-local
IMAGE_TAG=latest
UVICORN_WORKERS=2
```

## 2. Levantar

```bash
cd /opt/semia-app
git pull   # traer conf.d.hostinger + docker-compose.hostinger.yml

docker compose -f docker-compose.prod.yml -f docker-compose.hostinger.yml \
  --env-file .env up -d --build

docker compose -f docker-compose.prod.yml -f docker-compose.hostinger.yml ps
curl -sI http://127.0.0.1:8080 | head -20
```

Seed admin (una vez):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.hostinger.yml \
  exec -e PYTHONPATH=/ backend python -m app.scripts.create_admin
```

Circuitos (opcional, pesado):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.hostinger.yml \
  exec -e PYTHONPATH=/ backend python -m app.scripts.import_circuitos
```

## 3. Probar sin DNS (túnel SSH)

Desde tu laptop:

```bash
ssh -L 8080:127.0.0.1:8080 root@<IP-VPS>
```

Abrí `http://localhost:8080`. El login con `COOKIE_SECURE=true` puede fallar en HTTP puro; queda OK cuando Apache sirva HTTPS.

## 4. Cuando `semia.studio` apunte a este VPS

1. DNS `A` → IP del VPS.
2. Apache: sitio nuevo (no editar el del panel). Ejemplo:

```apache
# /etc/apache2/sites-available/semia-studio.conf
<VirtualHost *:80>
    ServerName semia.studio
    ServerAlias www.semia.studio
    RewriteEngine on
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
```

```apache
# /etc/apache2/sites-available/semia-studio-ssl.conf
<VirtualHost *:443>
    ServerName semia.studio
    ServerAlias www.semia.studio

    SSLEngine on
    # Tras certbot:
    # SSLCertificateFile /etc/letsencrypt/live/semia.studio/fullchain.pem
    # SSLCertificateKeyFile /etc/letsencrypt/live/semia.studio/privkey.pem
    # Include /etc/letsencrypt/options-ssl-apache.conf

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/

    ErrorLog ${APACHE_LOG_DIR}/semia_studio_error.log
    CustomLog ${APACHE_LOG_DIR}/semia_studio_access.log combined
</VirtualHost>
```

```bash
a2enmod proxy proxy_http headers rewrite ssl
a2ensite semia-studio.conf semia-studio-ssl.conf
apache2ctl configtest && systemctl reload apache2
certbot --apache -d semia.studio -d www.semia.studio
```

3. Verificar `https://semia.studio` → login.

## 5. Override que creaste a mano en el server

Si ya tenías un `docker-compose.hostinger.yml` mínimo (solo ports), **reemplazalo** por el del repo (incluye `conf.d.hostinger` sin redirect SSL). Si no, `git pull` basta.
