import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

export async function catalogRoutes(app: FastifyInstance) {
  const UNCATEGORIZED_ID = "__uncategorized__";

  app.get("/public", async () => {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          published: { not: false },
          isUnavailable: false,
          isParent: false,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 5000,
      }),
      prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        description: string | null;
        sortOrder: number;
        products: any[];
      }
    >();

    const pickImage = (p: any) => {
      const firstFromArray = Array.isArray(p.imageUrls) && p.imageUrls.length ? p.imageUrls[0] : null;
      return p.imageUrl || firstFromArray || "";
    };

    for (const p of products) {
      const ids = Array.isArray(p.categoryIds) ? p.categoryIds.filter(Boolean) : [];
      const fallbackNames = String(p.category || "")
        .split(/[|;,]/g)
        .map((x) => x.trim())
        .filter(Boolean);

      const assignTo = new Set<string>();
      for (const id of ids) {
        const c = categoryById.get(String(id));
        if (c) assignTo.add(c.id);
      }
      if (!assignTo.size && fallbackNames.length) {
        for (const c of categories) {
          if (fallbackNames.some((n) => n.toLowerCase() === String(c.name || "").toLowerCase())) {
            assignTo.add(c.id);
          }
        }
      }
      if (!assignTo.size) {
        assignTo.add(UNCATEGORIZED_ID);
      }

      for (const cid of assignTo) {
        const c = categoryById.get(cid);
        const g = grouped.get(cid) || {
          id: c?.id || UNCATEGORIZED_ID,
          name: c?.name || "Prodotti",
          description: c?.description || null,
          sortOrder: c?.sortOrder ?? 999999,
          products: [],
        };
        g.products.push({
          id: p.id,
          sku: p.sku,
          name: p.name,
          shortDescription: p.shortDescription || "",
          price: Number(p.price || 0),
          suggestedPrice: Number(p.listPrice ?? p.price ?? 0),
          imageUrl: pickImage(p),
          brand: p.brand || "",
          mlProduct: Number(p.mlProduct || 0),
          nicotine: Number(p.nicotine || 0),
        });
        grouped.set(cid, g);
      }
    }

    const categoriesOut = Array.from(grouped.values())
      .map((g) => ({
        ...g,
        productsCount: g.products.length,
        products: g.products.sort((a, b) => String(a.name).localeCompare(String(b.name), "it")),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "it"));

    return {
      categories: categoriesOut,
      totals: {
        categories: categoriesOut.length,
        products: categoriesOut.reduce((sum, c) => sum + c.products.length, 0),
      },
    };
  });

  app.get("/", { preHandler: app.authenticate }, async (request) => {
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
