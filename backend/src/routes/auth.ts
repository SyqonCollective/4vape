import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import jwt from "jsonwebtoken";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        contactFirstName: z.string().min(1),
        contactLastName: z.string().min(1),
        legalName: z.string().min(2),
        vatNumber: z.string().min(1),
        sdiCode: z.string().min(1),
        address: z.string().min(1),
        cap: z.string().min(1),
        city: z.string().min(1),
        province: z.string().min(1),
        phone: z.string().min(1),
      })
      .parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.conflict("Email already registered");

    const company = await prisma.company.create({
      data: {
        name: body.legalName,
        legalName: body.legalName,
        vatNumber: body.vatNumber,
        contactFirstName: body.contactFirstName,
        contactLastName: body.contactLastName,
        sdiCode: body.sdiCode,
        address: body.address,
        cap: body.cap,
        city: body.city,
        province: body.province,
        phone: body.phone,
        email: body.email,
        status: "PENDING",
      },
    });

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: "BUYER",
        approved: false,
        companyId: company.id,
      },
    });

    return reply.code(201).send({ id: user.id, approved: user.approved });
  });

  app.post("/login", async (request, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(8) })
      .parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return reply.unauthorized("Invalid credentials");

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return reply.unauthorized("Invalid credentials");
    if (!user.approved) return reply.forbidden("User not approved");
    if (user.companyId) {
      const company = await prisma.company.findUnique({ where: { id: user.companyId } });
      if (company?.status && company.status !== "ACTIVE") {
        return reply.forbidden("Company not active");
      }
    }

    await prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => null);

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        companyId: user.companyId,
      },
      process.env.JWT_SECRET || "dev_secret"
    );

    return { token };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.user };
  });
}
