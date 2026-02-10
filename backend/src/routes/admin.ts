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
  async function resolveDefaultTaxRateId() {
    const settings = await prisma.appSetting.findFirst();
    if (!settings?.vatRateDefault) return null;
    const rate = Number(settings.vatRateDefault);
    if (!Number.isFinite(rate)) return null;
    const tax = await prisma.taxRate.findFirst({
      where: { rate: new Prisma.Decimal(rate) },
    });
    return tax?.id || null;
  }
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

  app.get("/companies", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.company.findMany({ orderBy: { name: "asc" } });
  });

  app.get("/orders", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const status = (request.query as any)?.status as string | undefined;
    const where = status ? { status: status as any } : undefined;
    return prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        company: true,
        createdBy: true,
        items: true,
      },
    });
  });

  app.post("/orders", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        companyId: z.string().min(1),
        status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"]).optional(),
        discountTotal: z.number().optional(),
        items: z.array(
          z.object({
            productId: z.string(),
            qty: z.number().int().positive(),
            unitPrice: z.number().optional(),
          })
        ),
      })
      .parse(request.body);

    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company) return reply.notFound("Company not found");

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { sourceSupplier: true },
    });
    const overrides = await prisma.productPrice.findMany({
      where: { companyId: body.companyId },
    });
    const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));

    const items = body.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw app.httpErrors.notFound("Product not found");
      const unitPrice =
        item.unitPrice != null
          ? new Prisma.Decimal(item.unitPrice)
          : overrideMap.get(product.id) ?? product.price;
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

    const subtotal = items.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
    const discountTotal = body.discountTotal ? new Prisma.Decimal(body.discountTotal) : new Prisma.Decimal(0);
    const total = Prisma.Decimal.max(subtotal.sub(discountTotal), new Prisma.Decimal(0));

    const order = await prisma.order.create({
      data: {
        companyId: company.id,
        createdById: user.id,
        status: body.status ?? "SUBMITTED",
        total,
        discountTotal,
        items: { create: items },
      },
      include: { company: true, items: true },
    });

    return reply.code(201).send(order);
  });

  app.patch("/orders/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"]).optional(),
        companyId: z.string().optional(),
        discountTotal: z.number().optional(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              qty: z.number().int().positive(),
              unitPrice: z.number().optional(),
            })
          )
          .optional(),
      })
      .parse(request.body);

    const existing = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return reply.notFound("Order not found");

    let itemsPayload: Prisma.OrderItemCreateManyOrderInput[] | undefined;
    let total = existing.total;
    let discountTotal =
      body.discountTotal != null ? new Prisma.Decimal(body.discountTotal) : existing.discountTotal;

    if (body.items) {
      const productIds = body.items.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { sourceSupplier: true },
      });
      const overrides = await prisma.productPrice.findMany({
        where: { companyId: body.companyId || existing.companyId },
      });
      const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
      itemsPayload = body.items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) throw app.httpErrors.notFound("Product not found");
        const unitPrice =
          item.unitPrice != null
            ? new Prisma.Decimal(item.unitPrice)
            : overrideMap.get(product.id) ?? product.price;
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
      const subtotal = itemsPayload.reduce(
        (sum, i) => sum.add(new Prisma.Decimal(i.lineTotal as any)),
        new Prisma.Decimal(0)
      );
      const discountValue = discountTotal || new Prisma.Decimal(0);
      total = Prisma.Decimal.max(subtotal.sub(discountValue), new Prisma.Decimal(0));
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: body.status ?? existing.status,
          companyId: body.companyId ?? existing.companyId,
          discountTotal,
          total,
          items: itemsPayload
            ? {
                deleteMany: {},
                createMany: { data: itemsPayload },
              }
            : undefined,
        },
        include: { items: true, company: true },
      });
      return updated;
    });
  });

  app.delete("/orders/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId: id } }),
      prisma.order.delete({ where: { id } }),
    ]);
    return reply.code(204).send();
  });

  app.get("/products", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const parentOnly = (request.query as any)?.parents === "true";
    const q = (request.query as any)?.q as string | undefined;
    const limitRaw = (request.query as any)?.limit as string | undefined;
    const orderBy = (request.query as any)?.orderBy as string | undefined;
    const take = limitRaw ? Math.min(Math.max(Number(limitRaw) || 0, 0), 200) : undefined;
    const where: Prisma.ProductWhereInput = parentOnly ? { isParent: true } : {};
    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: "insensitive" } },
        { sku: { contains: q.trim(), mode: "insensitive" } },
      ];
    }
    const orderByMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
      "created-desc": { createdAt: "desc" },
      "created-asc": { createdAt: "asc" },
      "name-asc": { name: "asc" },
      "name-desc": { name: "desc" },
    };
    return prisma.product.findMany({
      where,
      orderBy: orderByMap[orderBy || "created-desc"] || { createdAt: "desc" },
      take,
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
      const defaultTaxRateId = await resolveDefaultTaxRateId();
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
        vatIncluded: true,
        taxRateId: body.taxRateId || defaultTaxRateId || undefined,
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
    data.vatIncluded = true;
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
            nicotine: z.number().nullable().optional(),
            categoryId: z.string().nullable().optional(),
            taxRateId: z.string().nullable().optional(),
            exciseRateId: z.string().nullable().optional(),
            vatIncluded: z.boolean().optional(),
            published: z.boolean().optional(),
            isUnavailable: z.boolean().optional(),
            isParent: z.boolean().optional(),
            parentId: z.string().nullable().optional(),
            parentSort: z.number().nullable().optional(),
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
          ...(row.nicotine !== undefined
            ? { nicotine: row.nicotine == null ? undefined : new Prisma.Decimal(row.nicotine) }
            : {}),
          ...(row.categoryId !== undefined ? { categoryId: row.categoryId ?? null } : {}),
          ...(row.taxRateId !== undefined ? { taxRateId: row.taxRateId ?? null } : {}),
          ...(row.exciseRateId !== undefined ? { exciseRateId: row.exciseRateId ?? null } : {}),
          vatIncluded: true,
          ...(row.published !== undefined ? { published: row.published } : {}),
          ...(row.isParent !== undefined
            ? { isParent: row.isParent, parentId: row.isParent ? null : undefined }
            : {}),
          ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
          ...(row.parentSort !== undefined ? { parentSort: row.parentSort ?? undefined } : {}),
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
    const revenueStatuses = ["APPROVED", "FULFILLED"] as const;

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
      prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { in: revenueStatuses } },
      }),
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

    const ordersToday = await prisma.order.count({
      where: { createdAt: { gte: startOfToday }, status: { in: revenueStatuses } },
    });

    const daily = Array.from({ length: days }).map((_, i) => {
      const d = new Date(startRange);
      d.setDate(startRange.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: 0, total: 0 };
    });
    const index = new Map(daily.map((d, i) => [d.date, i]));
    for (const order of ordersLastDays) {
      if (!revenueStatuses.includes(order.status)) continue;
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

  app.get("/analytics", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string };
    const now = new Date();
    const end = query.end ? new Date(`${query.end}T23:59:59.999Z`) : now;
    const start = query.start ? new Date(`${query.start}T00:00:00.000Z`) : new Date(end);
    if (!query.start) start.setDate(end.getDate() - 29);
    const revenueStatuses = ["APPROVED", "FULFILLED"] as const;

    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
        status: { in: revenueStatuses },
      },
      include: {
        items: {
          include: {
            product: {
              include: { sourceSupplier: true, taxRateRef: true, categoryRef: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const days: Array<{
      date: string;
      revenue: number;
      cost: number;
      vat: number;
      excise: number;
      orders: number;
      items: number;
      margin: number;
    }> = [];
    const dayIndex = new Map<string, number>();
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      dayIndex.set(key, days.length);
      days.push({
        date: key,
        revenue: 0,
        cost: 0,
        vat: 0,
        excise: 0,
        orders: 0,
        items: 0,
        margin: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    let revenue = 0;
    let cost = 0;
    let vat = 0;
    let excise = 0;
    let items = 0;
    let orderCount = 0;
    const productAgg = new Map<string, { id: string; name: string; sku: string; revenue: number; qty: number }>();
    const supplierAgg = new Map<string, { id: string; name: string; revenue: number; qty: number }>();
    const categoryAgg = new Map<string, { name: string; revenue: number; qty: number; cost: number }>();

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const idx = dayIndex.get(key);
      if (idx != null) {
        days[idx].orders += 1;
      }
      orderCount += 1;
      for (const item of order.items) {
        const lineTotal = Number(item.lineTotal);
        const qty = item.qty;
        const product = item.product;
        const purchase = Number(product?.purchasePrice || 0);
        const rate = Number(product?.taxRate || product?.taxRateRef?.rate || 0);
        const vatIncluded = product?.vatIncluded ?? true;
        const vatAmount =
          rate > 0
            ? vatIncluded
              ? lineTotal - lineTotal / (1 + rate / 100)
              : lineTotal * (rate / 100)
            : 0;
        const exciseUnit = Number(
          product?.exciseTotal ?? (Number(product?.exciseMl || 0) + Number(product?.exciseProduct || 0))
        );
        const exciseAmount = exciseUnit * qty;

        revenue += lineTotal;
        cost += purchase * qty;
        vat += vatAmount;
        excise += exciseAmount;
        items += qty;

        if (idx != null) {
          days[idx].revenue += lineTotal;
          days[idx].cost += purchase * qty;
          days[idx].vat += vatAmount;
          days[idx].excise += exciseAmount;
          days[idx].items += qty;
        }

        if (product) {
          const existing = productAgg.get(product.id) || {
            id: product.id,
            name: product.name,
            sku: product.sku,
            revenue: 0,
            qty: 0,
          };
          existing.revenue += lineTotal;
          existing.qty += qty;
          productAgg.set(product.id, existing);
        }

        const supplier = product?.sourceSupplier;
        if (supplier) {
          const existing = supplierAgg.get(supplier.id) || {
            id: supplier.id,
            name: supplier.name,
            revenue: 0,
            qty: 0,
          };
          existing.revenue += lineTotal;
          existing.qty += qty;
          supplierAgg.set(supplier.id, existing);
        }

        const categoryName =
          product?.categoryRef?.name ||
          product?.category ||
          "-";
        if (categoryName) {
          const existing = categoryAgg.get(categoryName) || {
            name: categoryName,
            revenue: 0,
            qty: 0,
            cost: 0,
          };
          existing.revenue += lineTotal;
          existing.qty += qty;
          existing.cost += purchase * qty;
          categoryAgg.set(categoryName, existing);
        }
      }
    }

    for (const d of days) {
      d.margin = d.revenue - d.cost - d.vat - d.excise;
    }

    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    const topSuppliers = Array.from(supplierAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
    const topCategories = Array.from(categoryAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const grossMargin = revenue - cost;
    const netRevenue = revenue - vat - excise;
    const margin = revenue - cost - vat - excise;
    const avgOrderValue = orderCount ? revenue / orderCount : 0;
    const avgItemsPerOrder = orderCount ? items / orderCount : 0;
    const marginPct = revenue ? (grossMargin / revenue) * 100 : 0;
    const vatPct = revenue ? (vat / revenue) * 100 : 0;
    const excisePct = revenue ? (excise / revenue) * 100 : 0;

    return {
      totals: {
        revenue,
        cost,
        vat,
        excise,
        margin,
        grossMargin,
        netRevenue,
        orders: orderCount,
        items,
      },
      kpis: {
        avgOrderValue,
        avgItemsPerOrder,
        marginPct,
        vatPct,
        excisePct,
      },
      daily: days,
      topProducts,
      topSuppliers,
      topCategories,
    };
  });

  app.get("/analytics/export", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string; format?: string };
    const format = (query.format || "csv").toLowerCase();
    const start = query.start || "";
    const end = query.end || "";
    // Reuse analytics endpoint logic via internal call
    const analytics = await (async () => {
      const res = await (app as any).inject({
        method: "GET",
        url: `/admin/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        headers: { authorization: request.headers.authorization || "" },
      });
      return JSON.parse(res.payload);
    })();

    const rows = analytics.daily || [];
    const header = [
      "Date",
      "Orders",
      "Items",
      "Revenue",
      "Cost",
      "VAT",
      "Excise",
      "Margin",
    ];
    const csvEscape = (v: any) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/\"/g, "\"\"")}"`;
      }
      return s;
    };

    if (format === "xlsx" || format === "xls") {
      const sheetRows = rows
        .map((r: any) => [
          r.date,
          r.orders,
          r.items,
          Number(r.revenue || 0).toFixed(2),
          Number(r.cost || 0).toFixed(2),
          Number(r.vat || 0).toFixed(2),
          Number(r.excise || 0).toFixed(2),
          Number(r.margin || 0).toFixed(2),
        ]);
      const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Analytics">
  <Table>
   ${[header, ...sheetRows]
     .map(
       (row) =>
         `<Row>${row
           .map((cell: any) => `<Cell><Data ss:Type="String">${String(cell)}</Data></Cell>`)
           .join("")}</Row>`
     )
     .join("")}
  </Table>
 </Worksheet>
</Workbook>`;
      reply.header("Content-Type", "application/vnd.ms-excel");
      reply.header("Content-Disposition", `attachment; filename="analytics_${start}_${end}.xls"`);
      return reply.send(xml);
    }

    const csv = [header, ...rows.map((r: any) => ([
      r.date,
      r.orders,
      r.items,
      Number(r.revenue || 0).toFixed(2),
      Number(r.cost || 0).toFixed(2),
      Number(r.vat || 0).toFixed(2),
      Number(r.excise || 0).toFixed(2),
      Number(r.margin || 0).toFixed(2),
    ]))]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="analytics_${start}_${end}.csv"`);
    return reply.send(csv);
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
        ...(body.amount !== undefined ? { amount: new Prisma.Decimal(body.amount) } : {}),
      },
    });
  });

  app.get("/discounts", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.discount.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/discounts", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).default("ORDER"),
        target: z.string().optional(),
        type: z.enum(["PERCENT", "FIXED"]).default("PERCENT"),
        value: z.number().nonnegative(),
        active: z.boolean().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);
    return prisma.discount.create({
      data: {
        name: body.name,
        scope: body.scope,
        target: body.target,
        type: body.type,
        value: new Prisma.Decimal(body.value),
        active: body.active ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes,
      },
    });
  });

  app.patch("/discounts/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).optional(),
        target: z.string().optional(),
        type: z.enum(["PERCENT", "FIXED"]).optional(),
        value: z.number().nonnegative().optional(),
        active: z.boolean().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);
    return prisma.discount.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.scope ? { scope: body.scope } : {}),
        ...(body.target !== undefined ? { target: body.target } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.value !== undefined ? { value: new Prisma.Decimal(body.value) } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.startDate !== undefined
          ? { startDate: body.startDate ? new Date(body.startDate) : null }
          : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
  });

  app.delete("/discounts/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.discount.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/rules", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    return prisma.discountRule.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/rules", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        active: z.boolean().optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).default("ORDER"),
        target: z.string().optional(),
        type: z.enum(["PERCENT", "FIXED"]).default("PERCENT"),
        value: z.number().nonnegative(),
        maxDiscount: z.number().nonnegative().optional(),
        minQty: z.number().int().nonnegative().optional(),
        minSpend: z.number().nonnegative().optional(),
        stackable: z.boolean().optional(),
        priority: z.number().int().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        days: z.array(z.string()).optional(),
        timeFrom: z.string().optional(),
        timeTo: z.string().optional(),
        includeSkus: z.string().optional(),
        excludeSkus: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);
    return prisma.discountRule.create({
      data: {
        name: body.name,
        active: body.active ?? true,
        scope: body.scope,
        target: body.target,
        type: body.type,
        value: new Prisma.Decimal(body.value),
        maxDiscount: body.maxDiscount !== undefined ? new Prisma.Decimal(body.maxDiscount) : null,
        minQty: body.minQty,
        minSpend: body.minSpend !== undefined ? new Prisma.Decimal(body.minSpend) : null,
        stackable: body.stackable ?? false,
        priority: body.priority ?? 50,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        days: body.days || [],
        timeFrom: body.timeFrom,
        timeTo: body.timeTo,
        includeSkus: body.includeSkus,
        excludeSkus: body.excludeSkus,
        notes: body.notes,
      },
    });
  });

  app.patch("/rules/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        active: z.boolean().optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).optional(),
        target: z.string().optional(),
        type: z.enum(["PERCENT", "FIXED"]).optional(),
        value: z.number().nonnegative().optional(),
        maxDiscount: z.number().nonnegative().nullable().optional(),
        minQty: z.number().int().nonnegative().nullable().optional(),
        minSpend: z.number().nonnegative().nullable().optional(),
        stackable: z.boolean().optional(),
        priority: z.number().int().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        days: z.array(z.string()).optional(),
        timeFrom: z.string().nullable().optional(),
        timeTo: z.string().nullable().optional(),
        includeSkus: z.string().nullable().optional(),
        excludeSkus: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(request.body);
    return prisma.discountRule.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.scope ? { scope: body.scope } : {}),
        ...(body.target !== undefined ? { target: body.target || null } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.value !== undefined ? { value: new Prisma.Decimal(body.value) } : {}),
        ...(body.maxDiscount !== undefined
          ? { maxDiscount: body.maxDiscount != null ? new Prisma.Decimal(body.maxDiscount) : null }
          : {}),
        ...(body.minQty !== undefined ? { minQty: body.minQty ?? null } : {}),
        ...(body.minSpend !== undefined
          ? { minSpend: body.minSpend != null ? new Prisma.Decimal(body.minSpend) : null }
          : {}),
        ...(body.stackable !== undefined ? { stackable: body.stackable } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.startDate !== undefined
          ? { startDate: body.startDate ? new Date(body.startDate) : null }
          : {}),
        ...(body.endDate !== undefined
          ? { endDate: body.endDate ? new Date(body.endDate) : null }
          : {}),
        ...(body.days !== undefined ? { days: body.days } : {}),
        ...(body.timeFrom !== undefined ? { timeFrom: body.timeFrom || null } : {}),
        ...(body.timeTo !== undefined ? { timeTo: body.timeTo || null } : {}),
        ...(body.includeSkus !== undefined ? { includeSkus: body.includeSkus || null } : {}),
        ...(body.excludeSkus !== undefined ? { excludeSkus: body.excludeSkus || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      },
    });
  });

  app.delete("/rules/:id", async (request, reply) => {
    const user = requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.discountRule.delete({ where: { id } });
    return reply.code(204).send();
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
        categoryId: z.string().min(1).optional(),
        parentId: z.string().optional(),
        published: z.boolean().optional(),
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

    let category = null;
    if (body.categoryId) {
      category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) return reply.badRequest("Category not found");
    }

    const defaultTaxRateId = await resolveDefaultTaxRateId();
    for (const sp of supplierProducts) {
      const existing = await prisma.product.findUnique({ where: { sku: sp.supplierSku } });
      const price = body.price ?? sp.price ?? undefined;
      const stockQty = sp.stockQty ?? 0;

      const published = body.published ?? sp.published ?? existing?.published ?? false;
      if (!existing) {
        await prisma.product.create({
          data: {
            sku: sp.supplierSku,
            name: sp.name || sp.supplierSku,
            shortDescription: sp.shortDescription,
            description: sp.description,
            brand: sp.brand,
            category: category?.name ?? null,
            subcategory: sp.subcategory,
            categoryId: category?.id ?? null,
            parentId: body.parentId || null,
            price: price ?? 0,
            stockQty,
            imageUrl: sp.imageUrl,
            imageUrls: sp.imageUrls == null ? undefined : sp.imageUrls,
            published,
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
            vatIncluded: true,
            taxRateId: defaultTaxRateId || null,
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
            ...(category ? { category: category.name, categoryId: category.id } : {}),
            subcategory: sp.subcategory ?? existing.subcategory,
            parentId: body.parentId ?? existing.parentId,
            price: price ?? existing.price,
            stockQty,
            imageUrl: sp.imageUrl ?? existing.imageUrl,
            imageUrls:
              (sp.imageUrls ?? existing.imageUrls) == null
                ? undefined
                : (sp.imageUrls ?? existing.imageUrls) as Prisma.InputJsonValue,
            published,
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
            vatIncluded: true,
            ...(existing.taxRateId == null && defaultTaxRateId
              ? { taxRateId: defaultTaxRateId }
              : {}),
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
