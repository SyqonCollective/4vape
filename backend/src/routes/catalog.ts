import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (request) => {
    const companyId = request.user?.companyId || undefined;
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (!companyId) return products;

    const overrides = await prisma.productPrice.findMany({ where: { companyId } });
    const map = new Map(overrides.map((o) => [o.productId, o.price]));

    return products.map((p) => ({
      ...p,
      price: map.get(p.id) ?? p.price,
    }));
  });
}
