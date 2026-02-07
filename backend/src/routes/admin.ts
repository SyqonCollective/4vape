import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier, importStockFromSupplier } from "../jobs/importer.js";
import jwt from "jsonwebtoken";
import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
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
    const parentOnly = (request.query as any)?.parents === "true";
    return prisma.product.findMany({
      where: parentOnly ? { isParent: true } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        sourceSupplier: true,
        categoryRef: true,
        parent: true,
        images: true,
        taxRateRef: true,
        exciseRateRef: true,
        children: { select: { id: true, name: true, sku: true } },
      },
    });
  });

  app.get("/products/stock", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.product.findMany({
      select: {
        id: true,
        stockQty: true,
        isUnavailable: true,
      },
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
        categoryId: z.string().optional(),
        parentId: z.string().optional(),
        isParent: z.boolean().optional(),
        isUnavailable: z.boolean().optional(),
        shortDescription: z.string().optional(),
        subcategory: z.string().optional(),
        published: z.boolean().optional(),
        visibility: z.string().optional(),
        productType: z.string().optional(),
        parentSku: z.string().optional(),
        childSkus: z.any().optional(),
        codicePl: z.string().optional(),
        mlProduct: z.number().optional(),
        nicotine: z.number().optional(),
        exciseMl: z.number().optional(),
        exciseProduct: z.number().optional(),
        exciseTotal: z.number().optional(),
        taxRate: z.number().optional(),
        taxAmount: z.number().optional(),
        vatIncluded: z.boolean().optional(),
        taxRateId: z.string().optional(),
        exciseRateId: z.string().optional(),
        purchasePrice: z.number().optional(),
        listPrice: z.number().optional(),
        discountPrice: z.number().optional(),
        discountQty: z.number().optional(),
        imageUrls: z.any().optional(),
        barcode: z.string().optional(),
        price: z.number().nonnegative().optional(),
        stockQty: z.number().int().nonnegative().default(0),
        imageUrl: z.string().optional(),
      })
      .parse(request.body);

    if (!body.isParent && body.price === undefined) {
      return reply.badRequest("Price is required");
    }

    let categoryName = body.category;
    if (body.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) return reply.badRequest("Category not found");
      categoryName = category.name;
    }
    try {
      return await prisma.product.create({
        data: {
          ...body,
          category: categoryName,
        parentId: body.parentId || null,
        isParent: body.isParent ?? false,
        isUnavailable: body.isUnavailable ?? false,
        shortDescription: body.shortDescription,
        subcategory: body.subcategory,
        published: body.published,
        visibility: body.visibility,
        productType: body.productType,
        parentSku: body.parentSku,
        childSkus: body.childSkus,
        codicePl: body.codicePl,
        mlProduct: body.mlProduct,
        nicotine: body.nicotine,
        exciseMl: body.exciseMl,
        exciseProduct: body.exciseProduct,
        exciseTotal: body.exciseTotal,
        taxRate: body.taxRate,
        taxAmount: body.taxAmount,
        vatIncluded: body.vatIncluded ?? true,
        taxRateId: body.taxRateId,
        exciseRateId: body.exciseRateId,
        purchasePrice: body.purchasePrice,
        listPrice: body.listPrice,
        discountPrice: body.discountPrice,
        discountQty: body.discountQty,
        imageUrls: body.imageUrls,
        barcode: body.barcode,
        price: body.price ?? 0,
        source: "MANUAL",
      },
    });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return reply.code(409).send({ error: "SKU già esistente" });
      }
      throw err;
    }
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
        categoryId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        isParent: z.boolean().optional(),
        isUnavailable: z.boolean().optional(),
        shortDescription: z.string().optional(),
        subcategory: z.string().optional(),
        published: z.boolean().optional(),
        visibility: z.string().optional(),
        productType: z.string().optional(),
        parentSku: z.string().optional(),
        childSkus: z.any().optional(),
        codicePl: z.string().optional(),
        mlProduct: z.number().optional(),
        nicotine: z.number().optional(),
        exciseMl: z.number().optional(),
        exciseProduct: z.number().optional(),
        exciseTotal: z.number().optional(),
        taxRate: z.number().optional(),
        taxAmount: z.number().optional(),
        vatIncluded: z.boolean().optional(),
        taxRateId: z.string().nullable().optional(),
        exciseRateId: z.string().nullable().optional(),
        purchasePrice: z.number().optional(),
        listPrice: z.number().optional(),
        discountPrice: z.number().optional(),
        discountQty: z.number().optional(),
        imageUrls: z.any().optional(),
        barcode: z.string().optional(),
        price: z.number().nonnegative().optional(),
        stockQty: z.number().int().nonnegative().optional(),
        imageUrl: z.string().optional(),
      })
      .parse(request.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw app.httpErrors.notFound("Product not found");

    const data: any = { ...body };
    if (body.categoryId !== undefined) {
      if (body.categoryId) {
        const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
        if (!category) return reply.badRequest("Category not found");
        data.category = category.name;
      } else {
        data.category = null;
      }
    }
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.isParent !== undefined) data.isParent = body.isParent;
    if (body.isUnavailable !== undefined) data.isUnavailable = body.isUnavailable;
    if (body.vatIncluded !== undefined) data.vatIncluded = body.vatIncluded;
    if (body.taxRateId !== undefined) data.taxRateId = body.taxRateId;
    if (body.exciseRateId !== undefined) data.exciseRateId = body.exciseRateId;
    if (existing.source === "SUPPLIER") {
      if (data.isUnavailable === true) {
        data.stockQty = 0;
      } else if (data.isUnavailable === false) {
        const sp = await prisma.supplierProduct.findUnique({
          where: { supplierId_supplierSku: { supplierId: existing.sourceSupplierId || "", supplierSku: existing.sku } },
        });
        if (sp?.stockQty != null) data.stockQty = sp.stockQty;
      } else {
        delete (data as any).stockQty;
      }
    } else if (data.isUnavailable === true) {
      data.stockQty = 0;
    }

    return prisma.product.update({ where: { id }, data });
  });

  app.patch("/products/bulk", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        items: z.array(
          z.object({
            id: z.string().min(1),
            name: z.string().nullable().optional(),
            price: z.number().nullable().optional(),
            listPrice: z.number().nullable().optional(),
            purchasePrice: z.number().nullable().optional(),
            discountPrice: z.number().nullable().optional(),
            discountQty: z.number().nullable().optional(),
            stockQty: z.number().nullable().optional(),
            categoryId: z.string().nullable().optional(),
            taxRateId: z.string().nullable().optional(),
            exciseRateId: z.string().nullable().optional(),
            vatIncluded: z.boolean().optional(),
            published: z.boolean().optional(),
            isUnavailable: z.boolean().optional(),
          })
        ),
      })
      .parse(request.body);

    await prisma.$transaction(
      body.items.map((row) => {
        const data: Prisma.ProductUncheckedUpdateInput = {
          ...(row.name !== undefined ? { name: row.name || undefined } : {}),
          ...(row.price !== undefined
            ? { price: row.price == null ? undefined : new Prisma.Decimal(row.price) }
            : {}),
          ...(row.listPrice !== undefined
            ? { listPrice: row.listPrice == null ? undefined : new Prisma.Decimal(row.listPrice) }
            : {}),
          ...(row.purchasePrice !== undefined
            ? { purchasePrice: row.purchasePrice == null ? undefined : new Prisma.Decimal(row.purchasePrice) }
            : {}),
          ...(row.discountPrice !== undefined
            ? { discountPrice: row.discountPrice == null ? undefined : new Prisma.Decimal(row.discountPrice) }
            : {}),
          ...(row.discountQty !== undefined ? { discountQty: row.discountQty ?? undefined } : {}),
          ...(row.stockQty !== undefined ? { stockQty: row.stockQty ?? undefined } : {}),
          ...(row.categoryId !== undefined ? { categoryId: row.categoryId ?? null } : {}),
          ...(row.taxRateId !== undefined ? { taxRateId: row.taxRateId ?? null } : {}),
          ...(row.exciseRateId !== undefined ? { exciseRateId: row.exciseRateId ?? null } : {}),
          ...(row.vatIncluded !== undefined ? { vatIncluded: row.vatIncluded } : {}),
          ...(row.published !== undefined ? { published: row.published } : {}),
          ...(row.isUnavailable !== undefined
            ? { isUnavailable: row.isUnavailable, stockQty: row.isUnavailable ? 0 : undefined }
            : {}),
        };
        return prisma.product.update({ where: { id: row.id }, data });
      })
    );

    return reply.code(204).send();
  });

  app.get("/products/:id/images", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    return prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } });
  });

  app.post("/products/:id/images", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return reply.notFound("Product not found");

    const uploadsDir = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "..", "uploads");
    const productDir = path.join(uploadsDir, "products", id);
    await fs.mkdir(productDir, { recursive: true });

    const parts = (request as any).parts();
    const created: any[] = [];
    for await (const part of parts) {
      if (part.type !== "file") continue;
      const ext = path.extname(part.filename || "").slice(0, 10) || ".jpg";
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(productDir, filename);
      await fs.writeFile(filePath, await part.toBuffer());
      const url = `/api/uploads/products/${id}/${filename}`;
      const image = await prisma.productImage.create({
        data: { productId: id, url },
      });
      created.push(image);
    }
    return { items: created };
  });

  app.delete("/products/:id/images/:imageId", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const { id, imageId } = request.params as any;
    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== id) return reply.notFound("Image not found");
    await prisma.productImage.delete({ where: { id: imageId } });
    return reply.code(204).send();
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

  app.get("/metrics", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = 14;
    const startRange = new Date(startOfToday);
    startRange.setDate(startRange.getDate() - (days - 1));

    const [
      totalProducts,
      totalSuppliers,
      totalOrders,
      pendingUsers,
      pendingCompanies,
      totalRevenueAgg,
      recentOrders,
      ordersLastDays,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.order.count(),
      prisma.user.count({ where: { approved: false } }),
      prisma.company.count({ where: { status: "PENDING" } }),
      prisma.order.aggregate({ _sum: { total: true } }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { company: true },
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: startRange } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const ordersToday = await prisma.order.count({ where: { createdAt: { gte: startOfToday } } });

    const daily = Array.from({ length: days }).map((_, i) => {
      const d = new Date(startRange);
      d.setDate(startRange.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: 0, total: 0 };
    });
    const index = new Map(daily.map((d, i) => [d.date, i]));
    for (const order of ordersLastDays) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const idx = index.get(key);
      if (idx == null) continue;
      daily[idx].count += 1;
      daily[idx].total += Number(order.total);
    }

    return {
      totals: {
        products: totalProducts,
        suppliers: totalSuppliers,
        orders: totalOrders,
        ordersToday,
        pendingUsers,
        pendingCompanies,
        revenue: Number(totalRevenueAgg._sum.total || 0),
      },
      daily,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: Number(o.total),
        createdAt: o.createdAt,
        company: o.company?.name || "-",
      })),
    };
  });

  app.get("/settings", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    let settings = await prisma.appSetting.findFirst();
    if (!settings) {
      settings = await prisma.appSetting.create({ data: {} });
    }
    return settings;
  });

  app.get("/taxes", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.taxRate.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/taxes", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        rate: z.number().nonnegative(),
      })
      .parse(request.body);
    return prisma.taxRate.create({
      data: { name: body.name, rate: new Prisma.Decimal(body.rate) },
    });
  });

  app.patch("/taxes/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        rate: z.number().nonnegative().optional(),
      })
      .parse(request.body);
    return prisma.taxRate.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.rate != null ? { rate: new Prisma.Decimal(body.rate) } : {}),
      },
    });
  });

  app.delete("/taxes/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.taxRate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/excises", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.exciseRate.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/excises", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        type: z.enum(["ML", "PRODUCT"]),
        amount: z.number().nonnegative(),
      })
      .parse(request.body);
    return prisma.exciseRate.create({
      data: { name: body.name, type: body.type, amount: new Prisma.Decimal(body.amount) },
    });
  });

  app.patch("/excises/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        type: z.enum(["ML", "PRODUCT"]).optional(),
        amount: z.number().nonnegative().optional(),
      })
      .parse(request.body);
    return prisma.exciseRate.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.amount != null ? { amount: new Prisma.Decimal(body.amount) } : {}),
      },
    });
  });

  app.delete("/excises/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.exciseRate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.patch("/settings", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        vatRateDefault: z.number().nonnegative().optional(),
      })
      .parse(request.body);
    let settings = await prisma.appSetting.findFirst();
    if (!settings) {
      settings = await prisma.appSetting.create({ data: body });
      return settings;
    }
    return prisma.appSetting.update({ where: { id: settings.id }, data: body });
  });

  app.get("/categories", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/categories", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        parentId: z.string().optional(),
      })
      .parse(request.body);
    const slug = slugify(body.name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) return reply.conflict("Category already exists");
    return prisma.category.create({
      data: {
        name: body.name,
        slug,
        parentId: body.parentId || null,
      },
    });
  });

  app.patch("/categories/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        parentId: z.string().nullable().optional(),
      })
      .parse(request.body);
    const data: any = {};
    if (body.name) {
      data.name = body.name;
      data.slug = slugify(body.name);
    }
    if (body.parentId !== undefined) data.parentId = body.parentId;
    return prisma.category.update({ where: { id }, data });
  });

  app.delete("/categories/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const children = await prisma.category.count({ where: { parentId: id } });
    if (children > 0) return reply.conflict("Remove children first");
    await prisma.category.delete({ where: { id } });
    return reply.code(204).send();
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
    if (!supplier) throw app.httpErrors.notFound("Supplier not found");
    try {
      const result = await importFullFromSupplier(supplier);
      return result;
    } catch (err: any) {
      const message = err?.message || "Import failed";
      return reply.badRequest(message);
    }
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2),
      })
      .parse(request.body);
    return prisma.supplier.update({ where: { id: supplierId }, data: { name: body.name } });
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
        categoryId: z.string().min(1),
        parentId: z.string().optional(),
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

    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) return reply.badRequest("Category not found");

    for (const sp of supplierProducts) {
      const existing = await prisma.product.findUnique({ where: { sku: sp.supplierSku } });
      const price = body.price ?? sp.price ?? undefined;
      const stockQty = sp.stockQty ?? 0;

      if (!existing) {
        await prisma.product.create({
          data: {
            sku: sp.supplierSku,
            name: sp.name || sp.supplierSku,
            shortDescription: sp.shortDescription,
            description: sp.description,
            brand: sp.brand,
            category: category.name,
            subcategory: sp.subcategory,
            categoryId: category.id,
            parentId: body.parentId || null,
            price: price ?? 0,
            stockQty,
            imageUrl: sp.imageUrl,
            imageUrls: sp.imageUrls == null ? undefined : sp.imageUrls,
            published: sp.published,
            visibility: sp.visibility,
            productType: sp.productType,
            parentSku: sp.parentSku,
            childSkus: sp.childSkus == null ? undefined : sp.childSkus,
            codicePl: sp.codicePl,
            mlProduct: sp.mlProduct,
            nicotine: sp.nicotine,
            exciseMl: sp.exciseMl,
            exciseProduct: sp.exciseProduct,
            exciseTotal: sp.exciseTotal,
            taxRate: sp.taxRate,
            taxAmount: sp.taxAmount,
            purchasePrice: sp.purchasePrice,
            listPrice: sp.listPrice,
            discountPrice: sp.discountPrice,
            discountQty: sp.discountQty,
            barcode: sp.barcode,
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
            shortDescription: sp.shortDescription ?? existing.shortDescription,
            description: sp.description ?? existing.description,
            brand: sp.brand ?? existing.brand,
            category: category.name,
            subcategory: sp.subcategory ?? existing.subcategory,
            categoryId: category.id,
            parentId: body.parentId ?? existing.parentId,
            price: price ?? existing.price,
            stockQty,
            imageUrl: sp.imageUrl ?? existing.imageUrl,
            imageUrls:
              (sp.imageUrls ?? existing.imageUrls) == null
                ? undefined
                : (sp.imageUrls ?? existing.imageUrls) as Prisma.InputJsonValue,
            published: sp.published ?? existing.published,
            visibility: sp.visibility ?? existing.visibility,
            productType: sp.productType ?? existing.productType,
            parentSku: sp.parentSku ?? existing.parentSku,
            childSkus:
              (sp.childSkus ?? existing.childSkus) == null
                ? undefined
                : (sp.childSkus ?? existing.childSkus) as Prisma.InputJsonValue,
            codicePl: sp.codicePl ?? existing.codicePl,
            mlProduct: sp.mlProduct ?? existing.mlProduct,
            nicotine: sp.nicotine ?? existing.nicotine,
            exciseMl: sp.exciseMl ?? existing.exciseMl,
            exciseProduct: sp.exciseProduct ?? existing.exciseProduct,
            exciseTotal: sp.exciseTotal ?? existing.exciseTotal,
            taxRate: sp.taxRate ?? existing.taxRate,
            taxAmount: sp.taxAmount ?? existing.taxAmount,
            purchasePrice: sp.purchasePrice ?? existing.purchasePrice,
            listPrice: sp.listPrice ?? existing.listPrice,
            discountPrice: sp.discountPrice ?? existing.discountPrice,
            discountQty: sp.discountQty ?? existing.discountQty,
            barcode: sp.barcode ?? existing.barcode,
          },
        });
        updated += 1;
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
