import "dotenv/config";
import { prisma } from "../lib/db.js";

const email = process.argv[2];
if (!email) {
  console.error("Uso: npx tsx src/jobs/fix-admin.ts <email>");
  console.error("Esempio: npx tsx src/jobs/fix-admin.ts admin@logistica4vape.it");
  process.exit(1);
}

const normalized = email.trim().toLowerCase();

const existing = await prisma.user.findFirst({
  where: { email: { equals: normalized, mode: "insensitive" } },
});

if (existing) {
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { role: "ADMIN", approved: true },
  });
  console.log(`✅ Utente esistente promosso ad ADMIN: ${updated.email} (id: ${updated.id})`);
} else {
  const created = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash: "CLERK_MANAGED",
      role: "ADMIN",
      approved: true,
    },
  });
  console.log(`✅ Nuovo utente ADMIN creato: ${created.email} (id: ${created.id})`);
}

// Mostra tutti gli admin
const admins = await prisma.user.findMany({
  where: { role: { in: ["ADMIN", "MANAGER"] } },
  select: { id: true, email: true, role: true, approved: true, clerkUserId: true },
});
console.log("\n📋 Tutti gli utenti admin/manager:");
admins.forEach((a) =>
  console.log(`  ${a.email} | ${a.role} | approved=${a.approved} | clerk=${a.clerkUserId || "non collegato"}`)
);

await prisma.$disconnect();
