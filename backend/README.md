# 4Vape Backend (MVP)

## Stack
- Node.js 20
- Fastify
- PostgreSQL
- Prisma

## Setup (local)
1. Create `.env` from `.env.example`
2. Install deps:
   ```bash
   cd backend
   npm install
   ```
3. Run migrations:
   ```bash
   npm run prisma:migrate
   ```
4. Start dev server:
   ```bash
   npm run dev
   ```

## Supplier import
- Manual full import:
  ```bash
  npm run import:full -- --supplier-code=VAPEITALIA_LIQUIDS
  ```
- Stock update:
  ```bash
  npm run import:stock -- --supplier-code=VAPEITALIA_LIQUIDS
  ```

## Notes
- Configure `Supplier.fieldMap` if CSV headers differ.
- `import:full` creates new products if SKU does not exist.
- `import:stock` updates stock by SKU every 15 minutes via cron.
