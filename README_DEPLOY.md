# Deploy rapido 4Vape (Locale + VPS)

## Locale (Mac) — commit + push
```bash
cd "/Users/michaelruggeri/Desktop/Code/4vape buono"
git add .
git commit -m "update"
git push origin main
git push production main
```

## VPS (Ubuntu) — update backend
```bash
ssh root@82.165.175.171

GIT_DIR=/var/repo/4vape.git GIT_WORK_TREE=/var/www/4vape git checkout -f
cd /var/www/4vape/backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
systemctl restart 4vape-api
```

## Test rapido API
```bash
curl -i http://127.0.0.1:4000/health
```
