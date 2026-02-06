import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
  }
  interface FastifyRequest {
    user?: {
      id: string;
      role: string;
      companyId?: string | null;
    };
  }
}
