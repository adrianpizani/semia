# STOP AWS & redeploy — Semia

Runbook para **apagar costos** (vacaciones del cliente / fin del Free Plan) y **volver a levantar** cuando acuerden cuenta o billing.

Complementa [`DEPLOY.md`](./DEPLOY.md). Ir tildando cada paso.

**Contexto (oct 2026):** Free Plan por vencer; cliente ausente hasta ~18. Preferencia: stop ahora; transferir cuenta/billing **después**, no ahora.

---

## A. Antes de stoppear

### A1. Inventario (completar)

| Ítem | Valor |
|------|--------|
| Región | `sa-east-1` |
| Instance ID | |
| Instance name | |
| Elastic IP | |
| Allocation ID (EIP) | |
| Domain | `semia.studio` |
| DNS | DonWeb — registro `A` → Elastic IP |
| ECR registry | `….dkr.ecr.sa-east-1.amazonaws.com` |
| Path en EC2 | `~/semia` (ajustar si es otro) |
| Key pair | `semia-key.pem` |

### A2. Backup de datos (obligatorio si hay datos del cliente)

SSH a la instancia **mientras esté running**:

```bash
ssh -i ~/.ssh/semia-key.pem ubuntu@<elastic-ip>
cd ~/semia
mkdir -p ~/backups
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U semia pba_dashboard | gzip > ~/backups/semia-$(date +%F).sql.gz
ls -lh ~/backups/
```

Copiar el dump **fuera de AWS** (máquina local):

```bash
scp -i ~/.ssh/semia-key.pem \
  ubuntu@<elastic-ip>:~/backups/semia-*.sql.gz \
  ~/Proyectos/semia/backups/
```

Opcional: snapshot EBS desde la consola AWS si querés imagen completa del disco.

- [ ] `pg_dump` generado en el EC2
- [ ] `.sql.gz` copiado a la máquina local
- [ ] (Opcional) snapshot EBS creado

### A3. Backup de config (no commitear secretos)

- [ ] Copiar `.env` del EC2 a un lugar seguro local (1Password / archivo cifrado). **No** al repo.
- [ ] Anotar: certs en `~/semia/nginx/certs/` y en `/etc/letsencrypt/live/semia.studio/`.

---

## B. Stop — bajar Compute (mínimo recomendado)

### B1. Parar contenedores (ordenado)

```bash
cd ~/semia
docker compose -f docker-compose.prod.yml stop
# alternativa: docker compose -f docker-compose.prod.yml down
# (sin -v: no borra el volumen postgres_data)
```

- [ ] Contenedores detenidos

### B2. Stop instancia EC2

Consola EC2 → instancia → **Stop instance** (no Terminate).

- **EC2 Compute** → ~USD 0.
- **EBS (EC2 – Other)** → **sigue cobrando** el disco.

- [ ] Estado de la instancia = `stopped`

### B3. Elastic IP

Una EIP asociada a una instancia **stopped** puede generar un cargo chico.

| Opción | Pros | Contras |
|--------|------|---------|
| Liberar EIP | Menos costo | Al start, IP nueva → actualizar DNS DonWeb; posible revalidar cert |
| Dejar asociada | DNS estable | Cargo EIP idle |

**Decisión:** _______________

Si liberás: anotá la IP vieja y el Allocation ID.

- [ ] EIP: liberada / dejada asociada (tachar lo que no aplique)

### B4. Qué no tocar (todavía)

- [ ] No borrar el volumen EBS si querés redeploy rápido con los mismos datos
- [ ] No borrar ECR (costo bajo; limpiar tags viejos después si hace falta)
- [ ] No borrar key pair ni security group
- [ ] DNS puede quedar apuntando a IP vieja (sitio caído OK hasta que vuelva el cliente)

### B5. Verificación post-stop

- [ ] EC2 = `stopped`
- [ ] Dump `.sql.gz` en la máquina local
- [ ] `.env` respaldado fuera de AWS
- [ ] Billing: Compute en baja; revisar EBS al día siguiente

---

## C. Opción agresiva (casi cero costo hasta el redeploy)

Solo si **A2** está OK y aceptás más trabajo al volver:

1. Snapshot del volumen (o confiar solo en `pg_dump`).
2. **Terminate** la instancia (o borrar el volumen tras el snapshot).
3. Liberar EIP.
4. Redeploy ≈ [`DEPLOY.md`](./DEPLOY.md) desde cero + restore del dump.

**Decisión:** stop suave (B) / agresivo (C) = _______________

---

## D. Mientras tanto (hasta acuerdo con el cliente)

- [ ] Avisar: entorno prod apagado por Free Plan / costos; se vuelve a levantar post-vacaciones
- [ ] Acordar: **cuenta AWS del cliente** o él como payer
- [ ] No transferir ownership mientras esté de vacaciones
- [ ] Seguir laburando en local con `docker compose` si hace falta

---

## E. Redeploy (cuando vuelva / haya billing)

### E1. Decisión de cuenta

- [ ] Misma cuenta Adrian (Paid) — temporal
- [ ] Cuenta nueva del cliente + vos como IAM admin — preferido
- [ ] Organization / consolidated billing

### E2a. Si la instancia solo estaba **stopped**

1. EC2 → **Start instance**.
2. Si liberaste EIP: asociar EIP (nueva o la reservada) → actualizar registro `A` en DonWeb.
3. SSH y levantar:

```bash
cd ~/semia
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

4. Verificar: `https://semia.studio` → login.
5. Si el cert falló por cambio de IP/DNS: re-correr certbot (`DEPLOY.md` §5).

- [ ] Instancia `running`
- [ ] Compose up OK
- [ ] HTTPS + login OK

### E2b. Si terminaste la instancia / volumen nuevo

1. Seguir `DEPLOY.md` §1–6 (launch, clone, `.env`, compose, TLS).
2. Imágenes: pull desde ECR (o build en máquina con RAM; **no** buildear Next en t3.micro):

```bash
# En EC2, con ECR_REGISTRY e IMAGE_TAG en .env
aws ecr get-login-password --region sa-east-1 \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

3. Restore DB (ajustar fecha del dump):

```bash
gunzip -c ~/backups/semia-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U semia pba_dashboard
```

Coordinar orden: entrypoint (Alembic + seed geo) vs restore. Si el dump ya trae datos y schema, evitar pisar sin querer.

4. `create_admin` solo si los usuarios no están en el dump.
5. Checklist de verificación en `DEPLOY.md` §6.

- [ ] EC2 nuevo + stack up
- [ ] Restore DB OK
- [ ] HTTPS + login OK

### E3. Post-redeploy

- [ ] Login admin OK
- [ ] Mapa + una métrica OK
- [ ] Cron de `pg_dump` de nuevo (`DEPLOY.md` §7)
- [ ] AWS Budget / alerta de billing en la cuenta que paga
- [ ] Actualizar la tabla de inventario (A1) con Instance ID / EIP nuevos

---

## F. Notas / pendientes

- [ ] Pegar Instance ID y EIP reales en A1
- [ ] Confirmar si hay cron de backup ya instalado en el EC2
- [ ] Confirmar si prod usa imágenes ECR o build en el server
- [ ] Fecha objetivo de redeploy: _______________
- [ ] Decisión final stop suave (B) vs agresivo (C): _______________
