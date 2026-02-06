import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import jwt from "jsonwebtoken";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import { prisma } from "./lib/db.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(sensible);
await prisma.$connect();

if (process.env.ENABLE_SWAGGER === "true") {
  await app.register(swagger, {
    openapi: {
      info: { title: "4Vape API", version: "0.1.0" },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}

app.decorate("authenticate", (request: any, reply: any, done: any) => {
  const authHeader = request.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Missing Bearer token",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    request.user = payload;
    done();
  } catch (err: any) {
    reply.code(401).send({
      error: "Unauthorized",
      message: err?.message || "Invalid token",
    });
    return;
  }
});

await app.register(authRoutes, { prefix: "/auth" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(catalogRoutes, { prefix: "/catalog" });
await app.register(orderRoutes, { prefix: "/orders" });

const port = Number(process.env.PORT || 4000);
app.get("/health", async () => ({ ok: true }));
await app.listen({ port, host: "0.0.0.0" });
