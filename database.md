# Modifiche Database — Aggiornamento VPS

## Come applicare

Dopo aver fatto il deploy del codice sulla VPS:

```bash
cd /path/to/backend
npx prisma migrate deploy
npx prisma generate
```

Se `prisma migrate deploy` non funziona, eseguire manualmente le due migrazioni nell'ordine indicato sotto.

---

## 1. Treasury Deposits (`20260301120000_treasury_deposits`)

Nuova tabella `TreasuryDeposit` per gestire acconti e pagamenti parziali nella Tesoreria.

```sql
CREATE TABLE "TreasuryDeposit" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreasuryDeposit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TreasuryDeposit_settlementId_idx" ON "TreasuryDeposit"("settlementId");

ALTER TABLE "TreasuryDeposit"
  ADD CONSTRAINT "TreasuryDeposit_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "TreasurySettlement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 2. User Permissions (`20260301130000_user_permissions`)

Nuovo campo `permissions` (JSONB) sulla tabella `User` per i permessi per sezione del pannello admin.

```sql
ALTER TABLE "User" ADD COLUMN "permissions" JSONB;
```

---

## Riepilogo modifiche schema Prisma

| Modello / Campo           | Tipo              | Descrizione                                      |
|---------------------------|-------------------|--------------------------------------------------|
| `TreasuryDeposit`         | Nuova tabella     | Acconti/pagamenti parziali legati a settlement    |
| `TreasuryDeposit.amount`  | `Decimal(12,2)`   | Importo del singolo acconto                      |
| `TreasuryDeposit.date`    | `DateTime`        | Data del pagamento                               |
| `User.permissions`        | `Json?`           | Permessi sezione admin (es. `{"orders":true}`)   |
