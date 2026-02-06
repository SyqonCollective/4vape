import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import { prisma } from "./lib/db.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(sensible);
await app.register(jwt, { secret: process.env.JWT_SECRET || "dev_secret" });

await prisma.$connect();

if (process.env.ENABLE_SWAGGER === "true") {
  await app.register(swagger, {
    openapi: {
      info: { title: "4Vape API", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}

app.decorate("authenticate", async (request: any, reply: any) => {
  const authHeader = request.headers?.authorization || "";
  try {
    await Promise.race([
      request.jwtVerify(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth timeout")), 2000)
      ),
    ]);
  } catch (err: any) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: err?.message || "Auth failed",
      hasAuthHeader: Boolean(request.headers?.authorization),
      authHeaderPrefix: authHeader.slice(0, 12),
    });
  }
});

await app.register(authRoutes, { prefix: "/auth" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(catalogRoutes, { prefix: "/catalog" });
await app.register(orderRoutes, { prefix: "/orders" });

const port = Number(process.env.PORT || 4000);
app.get("/health", async () => ({ ok: true }));
await app.listen({ port, host: "0.0.0.0" });
