import "dotenv/config";
import { prisma } from "../lib/db.js";

// Trova duplicati logisticasalentina
const dups = await prisma.user.findMany({
  where: { email: { contains: "logisticasalentina", mode: "insensitive" } },
  select: { id: true, email: true, clerkUserId: true, role: true },
});
console.log("Duplicati trovati:", JSON.stringify(dups, null, 2));

// Elimina quelli senza clerkUserId
for (const d of dups) {
  if (d.clerkUserId === null) {
    await prisma.user.delete({ where: { id: d.id } });
    console.log("Eliminato duplicato:", d.email, d.id);
  }
}

// Elimina anche admin@4vape.local se senza clerk
const localAdmin = await prisma.user.findFirst({
  where: { email: "admin@4vape.local" },
});
if (localAdmin && !localAdmin.clerkUserId) {
  await prisma.user.delete({ where: { id: localAdmin.id } });
  console.log("Eliminato admin@4vape.local (senza clerk)");
}

// Mostra admin rimasti
const remaining = await prisma.user.findMany({
  where: { role: { in: ["ADMIN", "MANAGER"] } },
  select: { id: true, email: true, role: true, clerkUserId: true, approved: true },
});
console.log("\nAdmin rimasti:");
remaining.forEach((u) =>
  console.log(`  ${u.email} | ${u.role} | approved=${u.approved} | clerk=${u.clerkUserId || "non collegato"}`)
);

await prisma.$disconnect();
