# 4Vape - Struttura Attuale e Deploy Operativo

Guida pratica per lavorare senza rompere `admin` e `pubblico`.

## 1) Architettura attuale

- `logistica4vape.it` = pannello admin (frontend admin build dedicata)
- `api.logistica4vape.it` = API backend (stesso backend unico)
- `svapodistribuzione.it` = sito pubblico clienti (frontend pubblico build dedicata)
- `api.svapodistribuzione.it` = API backend (stesso backend unico)

Backend unico su:
- `/var/www/4vape/backend`

Frontend con **2 build separate**:
- Admin build -> `/var/www/4vape/dist`
- Public build -> `/var/www/svapodistribuzione/dist`

## 2) Struttura repo locale

Repo locale (Mac):
- `/Users/michaelruggeri/Desktop/Code/4vape buono`

Cartelle principali:
- `src/` frontend React
- `backend/src/` backend Fastify + Prisma
- `backend/prisma/` schema e migrazioni DB

## 3) Flusso corretto: sviluppo + push

Da locale:

```bash
cd "/Users/michaelruggeri/Desktop/Code/4vape buono"
git status
git add <file_modificati>
git commit -m "messaggio chiaro"
git push origin main
git push production main
```

Nota:
- non includere file sporchi non utili (es. `push.txt`) se non servono.

## 4) Deploy su VPS (setup attuale senza git pull in /var/www/4vape)

Sincronizza codice da Mac a VPS:

```bash
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  "/Users/michaelruggeri/Desktop/Code/4vape buono/" \
  root@82.165.175.171:/var/www/4vape/
```

## 5) Build frontend corretta (OBBLIGATORIA in doppio output)

Accedi al VPS:

```bash
ssh root@82.165.175.171
cd /var/www/4vape
npm install
```

### 5.1 Build Admin (con Clerk)

```bash
VITE_API_BASE="https://api.logistica4vape.it" \
VITE_CLERK_PUBLISHABLE_KEY="pk_live_..." \
VITE_CLERK_SIGN_IN_URL="/admin/login" \
VITE_CLERK_SIGN_IN_FORCE_REDIRECT_URL="/admin/dashboard" \
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL="/admin/dashboard" \
npm run build -- --outDir dist-admin
```

### 5.2 Build Pubblico (senza Clerk)

```bash
VITE_API_BASE="https://api.svapodistribuzione.it" \
VITE_CLERK_PUBLISHABLE_KEY="" \
npm run build -- --outDir dist-public
```

### 5.3 Copia nelle root corrette

```bash
rsync -av --delete /var/www/4vape/dist-admin/ /var/www/4vape/dist/
rsync -av --delete /var/www/4vape/dist-public/ /var/www/svapodistribuzione/dist/
```

## 6) Build backend + restart servizi

```bash
cd /var/www/4vape/backend
npm install
npm run build
npx prisma migrate deploy
systemctl restart 4vape-api
systemctl status 4vape-api --no-pager -n 40
```

Reload nginx:

```bash
nginx -t && systemctl reload nginx
```

## 7) Verifiche rapide post-deploy

```bash
curl -I https://logistica4vape.it/admin/login
curl -I https://svapodistribuzione.it
curl -I https://api.logistica4vape.it/health
curl -I https://api.svapodistribuzione.it/health
```

Verifica endpoint pubblico catalogo:

```bash
curl -i https://api.svapodistribuzione.it/catalog/public | head -n 30
```

Deve rispondere `200`.

## 8) Problemi comuni e causa reale

### A) Torna il vecchio login (senza Clerk)
Causa: build frontend unica sovrascritta.

Fix:
- usare sempre doppia build (`dist-admin` + `dist-public`)
- copiare ciascuna nella sua root.

### B) Admin reindirizza al sito pubblico o viceversa
Causa: vhost nginx in conflitto / root sbagliata.

Fix:
- `logistica4vape.it` -> `/var/www/4vape/dist`
- `svapodistribuzione.it` -> `/var/www/svapodistribuzione/dist`

### C) `401` su `/catalog/public`
Causa: backend non aggiornato o route protetta da auth.

Fix:
- rebuild/restart backend
- verificare endpoint direttamente in locale server (`127.0.0.1:4000`).

### D) Warning Mixed Content su immagini
Causa: URL immagini salvate in `http://...`.

Effetto:
- warning browser, spesso non bloccante.

Fix consigliato:
- normalizzare URL immagini a `https://`.

## 9) Comandi “giornalieri” minimi

### Solo frontend
1. rsync codice
2. build admin + build pubblico
3. rsync dist
4. reload nginx

### Backend + frontend
1. rsync codice
2. build frontend doppio output
3. build backend
4. migrate deploy
5. restart `4vape-api`
6. reload nginx

## 10) Nota operativa importante

Non usare più una sola `dist` per entrambi i domini.
È la causa principale dei problemi visti (login sbagliato, env sbagliate, endpoint errati lato UI).

## 11) Hardening definitivo Clerk (consigliato)

Per evitare che il login admin torni mai più in stato "Configurazione Clerk mancante", standardizza build con env file fissi su VPS.

### 11.1 Env file persistenti VPS

```bash
cat > /etc/4vape-admin-frontend.env << 'EOF'
VITE_API_BASE=https://api.logistica4vape.it
VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsubG9naXN0aWNhNHZhcGUuaXQk
VITE_CLERK_SIGN_IN_URL=/admin/login
VITE_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/admin/dashboard
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/admin/dashboard
EOF

cat > /etc/4vape-public-frontend.env << 'EOF'
VITE_API_BASE=https://api.svapodistribuzione.it
VITE_CLERK_PUBLISHABLE_KEY=
EOF

chmod 600 /etc/4vape-admin-frontend.env /etc/4vape-public-frontend.env
```

### 11.2 Script unico deploy frontend

```bash
cat > /usr/local/bin/deploy-4vape-frontend << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd /var/www/4vape
npm install

# build admin (con Clerk)
set -a
source /etc/4vape-admin-frontend.env
set +a
npm run build -- --outDir dist-admin

# build pubblico (senza Clerk)
set -a
source /etc/4vape-public-frontend.env
set +a
npm run build -- --outDir dist-public

# publish
rsync -av --delete /var/www/4vape/dist-admin/ /var/www/4vape/dist/
rsync -av --delete /var/www/4vape/dist-public/ /var/www/svapodistribuzione/dist/

nginx -t
systemctl reload nginx
EOF

chmod +x /usr/local/bin/deploy-4vape-frontend
```

### 11.3 Uso operativo

Dopo il sync codice:

```bash
/usr/local/bin/deploy-4vape-frontend
```

Questo elimina errori manuali sulle variabili build e mantiene admin/public separati in modo stabile.
