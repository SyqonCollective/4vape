import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier, importStockFromSupplier } from "../jobs/importer.js";
import jwt from "jsonwebtoken";
import http from "node:http";
import https from "node:https";

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+)\s*(ml|mg|ohm|w|mah)/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "ml",
  "mg",
  "ohm",
  "w",
  "mah",
  "pz",
  "pack",
  "kit",
  "pod",
  "coil",
  "cartuccia",
  "resistenza",
  "liquido",
  "aroma",
  "sali",
  "nicotina",
  "svapo",
  "sigaretta",
  "elettronica",
  "mix",
  "flavor",
  "flavour",
  "by",
  "da",
  "per",
  "the",
  "and",
  "con",
  "confezione",
]);

function tokenizeName(value: string) {
  const norm = normalizeText(value);
  const tokens = new Set(
    norm
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );
  return Array.from(tokens);
}

function similarity(aTokens: string[], bTokens: string[]) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union ? intersect / union : 0;
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
    return prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: { sourceSupplier: true },
    });
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

  app.delete("/products/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.product.delete({ where: { id } });
    return reply.code(204).send();
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
    const pageParam = (request.query as any)?.page as string | undefined;
    const perPageParam = (request.query as any)?.perPage as string | undefined;
    const q = ((request.query as any)?.q as string | undefined)?.trim();
    const limit = Math.min(Number(limitParam || 200), 500);
    const perPage = Math.min(Number(perPageParam || 20), 200);
    const page = Math.max(Number(pageParam || 1), 1);
    const skip = (page - 1) * perPage;

    const where = {
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
    } as any;

    const [supplierProducts, total] = await Promise.all([
      prisma.supplierProduct.findMany({
        where,
        orderBy: { lastSeenAt: "desc" },
        take: Math.min(limit, perPage),
        skip,
      }),
      prisma.supplierProduct.count({ where }),
    ]);

    const skus = supplierProducts.map((p) => p.supplierSku);
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    });
    const imported = new Set(products.map((p) => p.sku));

    const items = supplierProducts.map((p) => ({
      ...p,
      isImported: imported.has(p.supplierSku),
    }));
    return { items, total, page, perPage };
  });

  app.get("/suppliers/:id/compare", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const limitParam = (request.query as any)?.limit as string | undefined;
    const limit = Math.min(Number(limitParam || 200), 500);

    const source = await prisma.supplierProduct.findMany({
      where: { supplierId, price: { not: null } },
      take: limit,
      orderBy: { lastSeenAt: "desc" },
    });

    const others = await prisma.supplierProduct.findMany({
      where: { supplierId: { not: supplierId }, price: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      take: 5000,
      include: { supplier: { select: { name: true } } },
    });

    const byBrand = new Map<string, any[]>();
    const byCategory = new Map<string, any[]>();
    for (const p of others) {
      const brand = p.brand ? normalizeText(p.brand) : "";
      const category = p.category ? normalizeText(p.category) : "";
      if (brand) {
        const list = byBrand.get(brand) || [];
        list.push(p);
        byBrand.set(brand, list);
      }
      if (category) {
        const list = byCategory.get(category) || [];
        list.push(p);
        byCategory.set(category, list);
      }
    }

    const results = [];
    for (const p of source) {
      const name = p.name || p.supplierSku;
      const tokens = tokenizeName(name);
      const brandKey = p.brand ? normalizeText(p.brand) : "";
      const categoryKey = p.category ? normalizeText(p.category) : "";
      const candidates = brandKey
        ? byBrand.get(brandKey) || []
        : categoryKey
        ? byCategory.get(categoryKey) || []
        : [];
      if (!candidates.length) continue;

      let best = { supplierId: p.supplierId, supplierName: null as string | null, price: p.price };
      const matches = [];
      for (const c of candidates) {
        const cTokens = tokenizeName(c.name || c.supplierSku);
        const score = similarity(tokens, cTokens);
        if (score < 0.75 || cTokens.length < 2) continue;
        matches.push({
          id: c.id,
          supplierId: c.supplierId,
          supplierName: c.supplier?.name,
          supplierSku: c.supplierSku,
          name: c.name,
          price: c.price,
          score,
        });
        if (c.price != null && best.price != null && c.price < best.price) {
          best = {
            supplierId: c.supplierId,
            supplierName: c.supplier?.name,
            price: c.price,
          };
        }
      }

      if (matches.length === 0) continue;

      results.push({
        source: {
          id: p.id,
          supplierId: p.supplierId,
          supplierSku: p.supplierSku,
          name,
          price: p.price,
          brand: p.brand,
          category: p.category,
        },
        best,
        matches: matches.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).slice(0, 5),
      });
    }

    return { items: results };
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
    let already = 0;
    let missing = 0;

    for (const sp of supplierProducts) {
      const existing = await prisma.product.findUnique({ where: { sku: sp.supplierSku } });
      const price = body.price ?? sp.price ?? undefined;
      const stockQty = sp.stockQty ?? 0;

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
        already += 1;
      }
    }

    if (supplierProducts.length < skus.length) {
      missing = skus.length - supplierProducts.length;
    }

    return { created, updated, missing, already };
  });

  app.get("/suppliers/:id/image", async (request, reply) => {
    const auth = request.headers?.authorization || "";
    const token =
      auth.startsWith("Bearer ")
        ? auth.slice(7).trim()
        : (request.query as any)?.token;
    if (!token) return reply.code(401).send({ error: "Unauthorized", message: "Missing token" });
    let user: any;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET || "dev_secret") as any;
    } catch (err: any) {
      return reply.code(401).send({ error: "Unauthorized", message: err?.message || "Invalid token" });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return reply.code(403).send({ error: "Forbidden", message: "Admin only" });
    }
    const supplierId = (request.params as any).id as string;
    const { productId, imageId } = request.query as any;
    if (!productId || !imageId) return reply.badRequest("Missing productId/imageId");

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier?.apiBaseUrl || !supplier?.apiKey) return reply.notFound("Supplier not configured");

    const base = supplier.apiBaseUrl.replace(/\/$/, "");
    const url = new URL(`${base}/images/products/${productId}/${imageId}`);
    url.searchParams.set("ws_key", supplier.apiKey);

    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const client = url.protocol === "https:" ? https : http;
        const req = client.request(
          url,
          {
            method: "GET",
            headers: {
              ...(supplier.apiHost ? { Host: supplier.apiHost } : {}),
              "User-Agent": "4vape-image-proxy",
            },
          },
          (res) => {
            if (!res.statusCode || res.statusCode >= 400) {
              return reject(new Error(`Image fetch failed: ${res.statusCode}`));
            }
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on("end", () => resolve(Buffer.concat(chunks)));
          }
        );
        req.on("error", reject);
        req.end();
      });

      reply.type("image/jpeg");
      return reply.send(buf);
    } catch (err: any) {
      return reply.code(404).send({ error: "Image fetch failed", message: err?.message || "Not found" });
    }
  });
}
