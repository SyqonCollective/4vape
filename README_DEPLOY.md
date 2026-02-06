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
cd /var/www/4vape/backend
git pull origin main
npm install
npm run build
systemctl restart 4vape-api
```

## Test rapido API
```bash
curl -i http://127.0.0.1:4000/health
```
