import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier, importStockFromSupplier } from "../jobs/importer.js";

function requireAdmin(request: any, reply: any) {
  const role = request.user?.role;
  if (role !== "ADMIN" && role !== "MANAGER") {
    reply.forbidden("Admin only");
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/users/pending", { preHandler: [requireAdmin] }, async () => {
    return prisma.user.findMany({ where: { approved: false } });
  });

  app.patch("/users/:id/approve", { preHandler: [requireAdmin] }, async (request) => {
    const id = (request.params as any).id as string;
    return prisma.user.update({ where: { id }, data: { approved: true } });
  });

  app.get("/products", { preHandler: [requireAdmin] }, async () => {
    return prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/products", { preHandler: [requireAdmin] }, async (request) => {
    const body = z
      .object({
        sku: z.string().min(1),
        name: z.string().min(2),
        description: z.string().optional(),
        brand: z.string().optional(),
        category: z.string().optional(),
        price: z.number().positive(),
        stockQty: z.number().int().nonnegative().default(0),
        imageUrl: z.string().url().optional(),
      })
      .parse(request.body);

    return prisma.product.create({
      data: {
        ...body,
        source: "MANUAL",
      },
    });
  });

  app.patch("/products/:id", { preHandler: [requireAdmin] }, async (request) => {
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        brand: z.string().optional(),
        category: z.string().optional(),
        price: z.number().positive().optional(),
        stockQty: z.number().int().nonnegative().optional(),
        imageUrl: z.string().url().optional(),
      })
      .parse(request.body);

    return prisma.product.update({ where: { id }, data: body });
  });

  app.get("/suppliers", { preHandler: [requireAdmin] }, async () => {
    return prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.get("/suppliers/:id/products", { preHandler: [requireAdmin] }, async (request) => {
    const supplierId = (request.params as any).id as string;
    const limitParam = (request.query as any)?.limit as string | undefined;
    const q = ((request.query as any)?.q as string | undefined)?.trim();
    const limit = Math.min(Number(limitParam || 200), 500);

    return prisma.supplierProduct.findMany({
      where: {
        supplierId,
        ...(q
          ? {
              OR: [
                { supplierSku: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { lastSeenAt: "desc" },
      take: limit,
    });
  });

  app.post("/suppliers", { preHandler: [requireAdmin] }, async (request) => {
    const body = z
      .object({
        name: z.string().min(2),
        code: z.string().min(2),
        isPrimary: z.boolean().optional(),
        csvFullUrl: z.string().url().optional(),
        csvStockUrl: z.string().url().optional(),
        fieldMap: z.record(z.string()).optional(),
      })
      .parse(request.body);

    return prisma.supplier.create({ data: body });
  });

  app.post("/suppliers/:id/import-full", { preHandler: [requireAdmin] }, async (request) => {
    const supplierId = (request.params as any).id as string;
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.csvFullUrl) throw app.httpErrors.notFound("Supplier or URL missing");

    const result = await importFullFromSupplier(supplier);
    return result;
  });

  app.post("/suppliers/:id/update-stock", { preHandler: [requireAdmin] }, async (request) => {
    const supplierId = (request.params as any).id as string;
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.csvStockUrl) throw app.httpErrors.notFound("Supplier or URL missing");

    const result = await importStockFromSupplier(supplier);
    return result;
  });
}
