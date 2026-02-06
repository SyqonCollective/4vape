import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        companyName: z.string().min(2),
        vatNumber: z.string().optional(),
      })
      .parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.conflict("Email already registered");

    const company = await prisma.company.create({
      data: {
        name: body.companyName,
        vatNumber: body.vatNumber,
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

    const token = app.jwt.sign({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    });

    return { token };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.user };
  });
}
