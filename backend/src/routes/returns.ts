import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "../lib/db.js";

export async function returnRoutes(app: FastifyInstance) {
  app.post("/request", async (request, reply) => {
    const parts = (request as any).parts();

    const data: any = {
      orderNumber: "",
      productName: "",
      problemDescription: "",
      contactName: null,
      contactEmail: null,
      companyId: null,
      userId: null,
    };

    const uploadsDir = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "..", "uploads");
    const baseDir = path.join(uploadsDir, "returns");
    await fs.mkdir(baseDir, { recursive: true });

    const pendingFiles: { filepath: string; url: string }[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        if (!part.filename) continue;
        const ext = path.extname(part.filename || "").slice(0, 10) || ".jpg";
        const filename = `${randomUUID()}${ext}`;
        const filePath = path.join(baseDir, filename);
        await fs.writeFile(filePath, await part.toBuffer());
        pendingFiles.push({
          filepath: filePath,
          url: `/api/uploads/returns/${filename}`,
        });
        continue;
      }

      const key = String(part.fieldname || "");
      const val = typeof part.value === "string" ? part.value : String(part.value || "");
      if (key in data) data[key] = val;
    }

    if (!String(data.orderNumber || "").trim()) {
      return reply.badRequest("Numero ordine obbligatorio");
    }
    if (!String(data.productName || "").trim()) {
      return reply.badRequest("Nome prodotto obbligatorio");
    }
    if (!String(data.problemDescription || "").trim()) {
      return reply.badRequest("Descrizione problema obbligatoria");
    }

    const created = await prisma.returnRequest.create({
      data: {
        orderNumber: String(data.orderNumber).trim(),
        productName: String(data.productName).trim(),
        problemDescription: String(data.problemDescription).trim(),
        contactName: data.contactName ? String(data.contactName).trim() : null,
        contactEmail: data.contactEmail ? String(data.contactEmail).trim() : null,
        companyId: data.companyId ? String(data.companyId).trim() : null,
        userId: data.userId ? String(data.userId).trim() : null,
        images: {
          create: pendingFiles.map((f) => ({ url: f.url })),
        },
      },
      include: { images: true },
    });

    return reply.code(201).send({
      id: created.id,
      status: created.status,
      images: created.images,
    });
  });
}
