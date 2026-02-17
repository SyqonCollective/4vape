import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";

const payloadSchema = z
  .object({
    event: z.string().optional(),
    status: z.string().optional(),
    orderId: z.string().optional(),
    orderNumber: z.union([z.number(), z.string()]).optional(),
    paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "COD", "OTHER"]).optional(),
    data: z.record(z.any()).optional(),
  })
  .passthrough();

function normalizeStatus(input?: string) {
  const value = String(input || "").toUpperCase();
  if (["PAID", "SUCCEEDED", "SUCCESS", "COMPLETED"].includes(value)) return "APPROVED";
  if (["FAILED", "ERROR", "DECLINED", "CANCELLED"].includes(value)) return "CANCELLED";
  if (["PROCESSING", "AUTHORIZED"].includes(value)) return "APPROVED";
  if (["PENDING", "WAITING"].includes(value)) return "SUBMITTED";
  if (["FULFILLED", "SHIPPED", "DELIVERED"].includes(value)) return "FULFILLED";
  return undefined;
}

function normalizeMethod(input?: string) {
  const value = String(input || "").toUpperCase();
  if (["CARD", "CREDIT_CARD", "STRIPE", "PAYPAL", "APPLE_PAY", "GOOGLE_PAY"].includes(value))
    return "CARD";
  if (["BANK_TRANSFER", "WIRE", "BONIFICO", "SEPA"].includes(value)) return "BANK_TRANSFER";
  if (["COD", "CONTRASSEGNO", "CASH_ON_DELIVERY"].includes(value)) return "COD";
  if (value === "OTHER") return "OTHER";
  return undefined;
}

export async function paymentRoutes(app: FastifyInstance) {
  app.post("/webhook", async (request, reply) => {
    const configuredSecret = (process.env.PAYMENTS_WEBHOOK_SECRET || "").trim();
    if (configuredSecret) {
      const headerSecret = String(request.headers["x-webhook-secret"] || "");
      const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const provided = headerSecret || bearer;
      if (provided !== configuredSecret) {
        return reply.code(401).send({ ok: false, error: "Invalid webhook secret" });
      }
    }

    const body = payloadSchema.parse(request.body || {});
    const event = String(body.event || body.data?.event || "").toLowerCase();
    const rawStatus = String(body.status || body.data?.status || "");
    const statusFromEvent = event.includes("failed")
      ? "CANCELLED"
      : event.includes("succeeded") || event.includes("paid")
      ? "APPROVED"
      : event.includes("fulfilled") || event.includes("shipped")
      ? "FULFILLED"
      : undefined;
    const normalizedStatus = statusFromEvent || normalizeStatus(rawStatus);

    const methodRaw = String(body.paymentMethod || body.data?.paymentMethod || body.data?.method || "");
    const normalizedMethod = normalizeMethod(methodRaw);

    const directOrderId = body.orderId || body.data?.orderId || body.data?.metadata?.orderId;
    const rawOrderNumber =
      body.orderNumber || body.data?.orderNumber || body.data?.metadata?.orderNumber;
    const orderNumber =
      rawOrderNumber == null || rawOrderNumber === ""
        ? undefined
        : Number.isFinite(Number(rawOrderNumber))
        ? Number(rawOrderNumber)
        : undefined;

    const existing = directOrderId
      ? await prisma.order.findUnique({ where: { id: String(directOrderId) } })
      : orderNumber
      ? await prisma.order.findUnique({ where: { orderNumber } })
      : null;

    if (!existing) {
      return reply.code(404).send({ ok: false, error: "Order not found" });
    }

    const updated = await prisma.order.update({
      where: { id: existing.id },
      data: {
        ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
        ...(normalizedMethod ? { paymentMethod: normalizedMethod as any } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
      },
    });

    return { ok: true, order: updated };
  });
}

