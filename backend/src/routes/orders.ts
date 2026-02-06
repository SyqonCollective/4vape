import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

export async function orderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const role = request.user?.role;
    const companyId = request.user?.companyId || undefined;

    if (role === "ADMIN" || role === "MANAGER") {
      return prisma.order.findMany({ include: { items: true } });
    }

    if (!companyId) return [];

    return prisma.order.findMany({
      where: { companyId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/", async (request, reply) => {
    const body = z
      .object({
        items: z.array(
          z.object({
            productId: z.string(),
            qty: z.number().int().positive(),
          })
        ),
      })
      .parse(request.body);

    const companyId = request.user?.companyId;
    const userId = request.user?.id;
    if (!companyId || !userId) return reply.forbidden("Company missing");

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const priceOverrides = await prisma.productPrice.findMany({ where: { companyId } });
    const overrideMap = new Map(priceOverrides.map((o) => [o.productId, o.price]));

    const items = body.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw app.httpErrors.notFound("Product not found");
      const unitPrice = overrideMap.get(product.id) ?? product.price;
      const lineTotal = unitPrice.mul(item.qty);

      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        qty: item.qty,
        unitPrice,
        lineTotal,
        supplierId: product.sourceSupplierId,
      };
    });

    const total = items.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));

    const order = await prisma.order.create({
      data: {
        companyId,
        createdById: userId,
        status: "SUBMITTED",
        total,
        items: {
          create: items,
        },
      },
      include: { items: true },
    });

    return reply.code(201).send(order);
  });
}
