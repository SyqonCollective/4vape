# Deploy rapido 4Vape (Locale + VPS)

## Locale (Mac) — build + push
```bash
cd "/Users/michaelruggeri/Desktop/Code/4vape buono"
git add .
git commit -m "update"
git push origin main
git push production main
```

## VPS (Ubuntu) — update backend manuale (se serve)
```bash
# entra in VPS prima
ssh root@82.165.175.171

# aggiorna il checkout dal bare repo
GIT_DIR=/var/repo/4vape.git GIT_WORK_TREE=/var/www/4vape git checkout -f

# rebuild backend
cd /var/www/4vape/backend
npm install
npm run build
systemctl restart 4vape-api
```

## Test rapido API
```bash
curl -i http://127.0.0.1:4000/health
```
