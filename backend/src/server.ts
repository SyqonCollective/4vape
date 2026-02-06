import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import jwt from "jsonwebtoken";
import { importStockFromSupplier } from "./jobs/importer.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import { prisma } from "./lib/db.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(sensible);
await prisma.$connect();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = process.env.UPLOADS_DIR || path.resolve(__dirname, "..", "uploads");
await fs.mkdir(uploadsDir, { recursive: true });

await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

await app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: "/uploads/",
  decorateReply: false,
});

if (process.env.ENABLE_SWAGGER === "true") {
  await app.register(swagger, {
    openapi: {
      info: { title: "4Vape API", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}

app.decorate("authenticate", (request: any, _reply: any, done: any) => {
  const authHeader = request.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return done(app.httpErrors.unauthorized("Missing Bearer token"));
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    request.user = payload;
    return done();
  } catch (err: any) {
    return done(app.httpErrors.unauthorized(err?.message || "Invalid token"));
  }
});

await app.register(authRoutes, { prefix: "/auth" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(catalogRoutes, { prefix: "/catalog" });
await app.register(orderRoutes, { prefix: "/orders" });

const port = Number(process.env.PORT || 4000);
app.get("/health", async () => ({ ok: true }));
await app.listen({ port, host: "0.0.0.0" });

// Optional: auto-sync supplier stock every N seconds
const syncEnabled = process.env.ENABLE_STOCK_SYNC === "true";
const syncIntervalSec = Number(process.env.STOCK_SYNC_INTERVAL_SECONDS || 60);
let syncRunning = false;

if (syncEnabled && Number.isFinite(syncIntervalSec) && syncIntervalSec > 0) {
  setInterval(async () => {
    if (syncRunning) return;
    syncRunning = true;
    try {
      const suppliers = await prisma.supplier.findMany({
        where: {
          OR: [
            { csvStockUrl: { not: null } },
            { apiType: "PRESTASHOP" },
          ],
        },
      });
      for (const s of suppliers) {
        if (s.csvStockUrl) {
          await importStockFromSupplier(s);
        }
      }
    } catch (err) {
      app.log.error(err, "stock sync failed");
    } finally {
      syncRunning = false;
    }
  }, syncIntervalSec * 1000);
}
