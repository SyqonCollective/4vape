import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

function parseSkus(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isRuleActive(rule: any, now: Date) {
  if (!rule.active) return false;
  if (rule.startDate && now < new Date(rule.startDate)) return false;
  if (rule.endDate && now > new Date(rule.endDate)) return false;
  if (rule.days && Array.isArray(rule.days) && rule.days.length) {
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const key = dayMap[now.getDay()];
    if (!rule.days.includes(key)) return false;
  }
  if (rule.timeFrom || rule.timeTo) {
    const current = now.toTimeString().slice(0, 5);
    if (rule.timeFrom && current < rule.timeFrom) return false;
    if (rule.timeTo && current > rule.timeTo) return false;
  }
  return true;
}

function matchRuleScope(rule: any, product: any) {
  const target = (rule.target || "").toLowerCase();
  if (!target && rule.scope !== "ORDER") return true;
  if (rule.scope === "PRODUCT") {
    return product.sku?.toLowerCase() === target || product.id?.toLowerCase() === target;
  }
  if (rule.scope === "CATEGORY") {
    return (
      product.categoryId?.toLowerCase() === target ||
      product.category?.toLowerCase() === target
    );
  }
  if (rule.scope === "BRAND") {
    return product.brand?.toLowerCase() === target;
  }
  if (rule.scope === "SUPPLIER") {
    return (
      product.sourceSupplierId?.toLowerCase() === target ||
      product.sourceSupplier?.name?.toLowerCase() === target
    );
  }
  if (rule.scope === "PARENT") {
    return product.parentId?.toLowerCase() === target;
  }
  return true;
}

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
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { sourceSupplier: true },
    });
    const priceOverrides = await prisma.productPrice.findMany({ where: { companyId } });
    const overrideMap = new Map(priceOverrides.map((o) => [o.productId, o.price]));

    const items = body.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw app.httpErrors.notFound("Product not found");
      // allow products that are also parent to be ordered
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
        _product: product,
      };
    });

    const subtotal = items.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));

    const now = new Date();
    const [discounts, rules] = await Promise.all([
      prisma.discount.findMany({ where: { active: true } }),
      prisma.discountRule.findMany({ where: { active: true } }),
    ]);

    const activeDiscounts = discounts.filter((d) => isRuleActive(d, now));
    const bestDiscount = activeDiscounts.reduce<Prisma.Decimal>((best, d) => {
      const applicable = items.filter((i) => matchRuleScope(d, i._product));
      if (!applicable.length) return best;
      const base = applicable.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
      const value =
        d.type === "PERCENT"
          ? base.mul(new Prisma.Decimal(d.value).div(100))
          : new Prisma.Decimal(d.value);
      return value.greaterThan(best) ? value : best;
    }, new Prisma.Decimal(0));

    const stackableDiscounts: Prisma.Decimal[] = [];
    let bestRule = new Prisma.Decimal(0);
    let bestPriority = -Infinity;
    for (const rule of rules) {
      if (!isRuleActive(rule, now)) continue;
      const includeSkus = parseSkus(rule.includeSkus);
      const excludeSkus = parseSkus(rule.excludeSkus);
      const applicable = items.filter((i) => {
        const product = i._product;
        if (!matchRuleScope(rule, product)) return false;
        if (includeSkus.length && !includeSkus.includes(product.sku)) return false;
        if (excludeSkus.length && excludeSkus.includes(product.sku)) return false;
        return true;
      });
      if (!applicable.length) continue;
      const qty = applicable.reduce((sum, i) => sum + i.qty, 0);
      const amount = applicable.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
      if (rule.minQty && qty < rule.minQty) continue;
      if (rule.minSpend && amount.lessThan(rule.minSpend)) continue;

      const raw =
        rule.type === "PERCENT"
          ? amount.mul(new Prisma.Decimal(rule.value).div(100))
          : new Prisma.Decimal(rule.value);
      const capped = rule.maxDiscount ? Prisma.Decimal.min(raw, new Prisma.Decimal(rule.maxDiscount)) : raw;
      if (rule.stackable) {
        stackableDiscounts.push(capped);
      } else {
        const prio = Number(rule.priority || 0);
        if (prio > bestPriority || (prio === bestPriority && capped.greaterThan(bestRule))) {
          bestPriority = prio;
          bestRule = capped;
        }
      }
    }

    const rulesTotal = stackableDiscounts.reduce((sum, v) => sum.add(v), new Prisma.Decimal(0)).add(bestRule);

    const discountTotal = Prisma.Decimal.min(subtotal, bestDiscount.add(rulesTotal));
    const total = subtotal.sub(discountTotal);

    const order = await prisma.order.create({
      data: {
        companyId,
        createdById: userId,
        status: "SUBMITTED",
        total,
        discountTotal,
        items: {
          create: items.map(({ _product, ...rest }) => rest),
        },
      },
      include: { items: true },
    });

    return reply.code(201).send(order);
  });
}
