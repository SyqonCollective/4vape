import "fastify";
import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      role: string;
      companyId?: string | null;
    };
    user: {
      id: string;
      role: string;
      companyId?: string | null;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
  }
}
