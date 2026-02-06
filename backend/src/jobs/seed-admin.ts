import "dotenv/config";
import { prisma } from "../lib/db.js";
import { hashPassword } from "../lib/auth.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const urls = {
  liquidsFull: process.env.VAPEITALIA_FULL_LIQUIDS_URL,
  liquidsStock: process.env.VAPEITALIA_STOCK_LIQUIDS_URL,
  hardwareFull: process.env.VAPEITALIA_FULL_HARDWARE_URL,
  hardwareStock: process.env.VAPEITALIA_STOCK_HARDWARE_URL,
};

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { email } });
let companyId: string;

if (!existing) {
  const company = await prisma.company.create({
    data: { name: "4Vape Admin", status: "ACTIVE" },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      approved: true,
      companyId,
    },
  });

  console.log({ id: user.id, email: user.email });
} else {
  companyId = existing.companyId || (await prisma.company.create({ data: { name: "4Vape Admin", status: "ACTIVE" } })).id;
  console.log("Admin already exists");
}

const suppliers = [
  {
    name: "VapeItalia Liquidi",
    code: "VAPEITALIA_LIQUIDS",
    csvFullUrl: urls.liquidsFull,
    csvStockUrl: urls.liquidsStock,
    isPrimary: true,
  },
  {
    name: "VapeItalia Hardware",
    code: "VAPEITALIA_HARDWARE",
    csvFullUrl: urls.hardwareFull,
    csvStockUrl: urls.hardwareStock,
    isPrimary: false,
  },
];

for (const s of suppliers) {
  const exists = await prisma.supplier.findUnique({ where: { code: s.code } });
  if (!exists) {
    await prisma.supplier.create({ data: s });
  }
}
process.exit(0);
