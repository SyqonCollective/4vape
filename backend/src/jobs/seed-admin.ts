import "dotenv/config";
import { prisma } from "../lib/db.js";
import { hashPassword } from "../lib/auth.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log("Admin already exists");
  process.exit(0);
}

const company = await prisma.company.create({
  data: { name: "4Vape Admin", status: "ACTIVE" },
});

const user = await prisma.user.create({
  data: {
    email,
    passwordHash: await hashPassword(password),
    role: "ADMIN",
    approved: true,
    companyId: company.id,
  },
});

console.log({ id: user.id, email: user.email });
process.exit(0);
