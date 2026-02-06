import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier, importStockFromSupplier } from "../jobs/importer.js";
import jwt from "jsonwebtoken";

function getUser(request: any, reply: any) {
  const auth = request.headers?.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized", message: "Missing Bearer token" });
    return null;
  }
  const token = auth.slice(7).trim();
  try {
    return jwt.verify(token, process.env.JWT_SECRET || "dev_secret") as any;
  } catch (err: any) {
    reply.code(401).send({ error: "Unauthorized", message: err?.message || "Invalid token" });
    return null;
  }
}

function requireAdmin(request: any, reply: any) {
  const user = getUser(request, reply);
  if (!user) return null;
  const role = user.role;
  if (role !== "ADMIN" && role !== "MANAGER") {
    reply.forbidden("Admin only");
    return null;
  }
  request.user = user;
  return user;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/ping", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return { ok: true };
  });

  app.get("/users/pending", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.user.findMany({ where: { approved: false } });
  });

  app.patch("/users/:id/approve", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    return prisma.user.update({ where: { id }, data: { approved: true } });
  });

  app.get("/products", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/products", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
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

  app.patch("/products/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
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

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw app.httpErrors.notFound("Product not found");

    const data = { ...body };
    if (existing.source === "SUPPLIER") {
      delete (data as any).stockQty;
    }

    return prisma.product.update({ where: { id }, data });
  });

  app.get("/suppliers", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("DB timeout in /admin/suppliers")), 2000)
    );
    const suppliers = await Promise.race([
      prisma.supplier.findMany({ orderBy: { createdAt: "desc" } }),
      timeout,
    ]);
    return suppliers;
  });

  app.get("/suppliers/:id/products", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
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

  app.post("/suppliers", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
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

  app.post("/suppliers/:id/import-full", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.csvFullUrl) throw app.httpErrors.notFound("Supplier or URL missing");

    const result = await importFullFromSupplier(supplier);
    return result;
  });

  app.post("/suppliers/:id/update-stock", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.csvStockUrl) throw app.httpErrors.notFound("Supplier or URL missing");

    const result = await importStockFromSupplier(supplier);
    return result;
  });

  app.post("/suppliers/:id/promote", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const body = z
      .object({
        supplierSku: z.string().min(1).optional(),
        supplierSkus: z.array(z.string().min(1)).optional(),
        price: z.number().positive().optional(),
        stockQty: z.number().int().nonnegative().optional(),
      })
      .parse(request.body);

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw app.httpErrors.notFound("Supplier not found");

    const skus =
      body.supplierSkus && body.supplierSkus.length > 0
        ? body.supplierSkus
        : body.supplierSku
        ? [body.supplierSku]
        : [];

    if (skus.length === 0) {
      return reply.badRequest("Missing supplierSku");
    }

    const supplierProducts = await prisma.supplierProduct.findMany({
      where: { supplierId, supplierSku: { in: skus } },
    });

    let created = 0;
    let updated = 0;
    let missing = 0;

    for (const sp of supplierProducts) {
      const existing = await prisma.product.findUnique({ where: { sku: sp.supplierSku } });
      const price = body.price ?? sp.price ?? undefined;
      const stockQty = body.stockQty ?? sp.stockQty ?? 0;

      if (!existing) {
        await prisma.product.create({
          data: {
            sku: sp.supplierSku,
            name: sp.name || sp.supplierSku,
            description: sp.description,
            brand: sp.brand,
            category: sp.category,
            price: price ?? 0,
            stockQty,
            imageUrl: sp.imageUrl,
            source: "SUPPLIER",
            sourceSupplierId: supplierId,
          },
        });
        created += 1;
      } else {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: sp.name || existing.name,
            description: sp.description ?? existing.description,
            brand: sp.brand ?? existing.brand,
            category: sp.category ?? existing.category,
            price: price ?? existing.price,
            stockQty,
            imageUrl: sp.imageUrl ?? existing.imageUrl,
            source: "SUPPLIER",
            sourceSupplierId: supplierId,
          },
        });
        updated += 1;
      }
    }

    if (supplierProducts.length < skus.length) {
      missing = skus.length - supplierProducts.length;
    }

    return { created, updated, missing };
  });
}
