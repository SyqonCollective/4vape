import jwt from "jsonwebtoken";
import { createClerkClient, verifyToken as verifyClerkToken } from "@clerk/backend";
import { prisma } from "./db.js";

export type SessionUser = {
  id: string;
  role: string;
  companyId?: string | null;
  email?: string | null;
  clerkUserId?: string | null;
};

export function getBearerTokenFromRequest(request: any): string | null {
  const authHeader = request?.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

async function loadLocalUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { company: true },
  });
}

async function loadLocalUserByEmailOrClerkId(clerkUserId: string, emails: string[]) {
  const normalized = emails
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean);
  return prisma.user.findFirst({
    where: {
      OR: [
        { clerkUserId },
        ...(normalized.length ? [{ email: { in: normalized } }] : []),
      ],
    },
    include: { company: true },
  });
}

function assertUserAllowed(user: any) {
  if (!user) throw new Error("User not found");
  if (!user.approved) throw new Error("User not approved");
  if (user.companyId && user.company?.status && user.company.status !== "ACTIVE") {
    throw new Error("Company not active");
  }
}

async function verifyInternalJwt(token: string): Promise<SessionUser | null> {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret") as any;
    const local = await loadLocalUserById(String(payload?.id || ""));
    if (!local) return null;
    assertUserAllowed(local);
    return {
      id: local.id,
      role: local.role,
      companyId: local.companyId,
      email: local.email,
      clerkUserId: local.clerkUserId,
    };
  } catch {
    return null;
  }
}

async function verifyClerkJwt(token: string): Promise<SessionUser | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  const claims = await verifyClerkToken(token, { secretKey });
  const clerkUserId = String(claims?.sub || "");
  if (!clerkUserId) return null;

  const clerk = createClerkClient({
    secretKey,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  const clerkUser = await clerk.users.getUser(clerkUserId);
  const emails = (clerkUser.emailAddresses || []).map((e) => e.emailAddress);

  let local = await loadLocalUserByEmailOrClerkId(clerkUserId, emails);
  if (!local) return null;

  if (!local.clerkUserId) {
    local = await prisma.user.update({
      where: { id: local.id },
      data: { clerkUserId },
      include: { company: true },
    });
  }

  assertUserAllowed(local);
  return {
    id: local.id,
    role: local.role,
    companyId: local.companyId,
    email: local.email,
    clerkUserId: local.clerkUserId,
  };
}

export async function resolveSessionUserFromToken(token: string): Promise<SessionUser | null> {
  const local = await verifyInternalJwt(token);
  if (local) return local;

  try {
    return await verifyClerkJwt(token);
  } catch {
    return null;
  }
}
