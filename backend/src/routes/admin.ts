import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, OrderStatus } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier, importStockFromSupplier } from "../jobs/importer.js";
import { parse as parseCsv } from "csv-parse/sync";
import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getBearerTokenFromRequest, resolveSessionUserFromToken } from "../lib/session.js";

async function getUser(request: any, reply: any) {
  if (request.user) return request.user;
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    reply.code(401).send({ error: "Unauthorized", message: "Missing Bearer token" });
    return null;
  }
  const user = await resolveSessionUserFromToken(token);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized", message: "Invalid token" });
    return null;
  }
  request.user = user;
  return user;
}

async function requireAdmin(request: any, reply: any) {
  const user = await getUser(request, reply);
  if (!user) return null;
  const role = user.role;
  if (role !== "ADMIN" && role !== "MANAGER") {
    reply.forbidden("Admin only");
    return null;
  }
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
  const defaultMailupMeta = {
    lists: [
      {
        id: 1,
        name: "Newsletter",
        description: "Iscritti alla newsletter.",
        guid: "AAFA5375-BCF1-4E06-965A-E3A98B626156",
      },
    ],
    groups: [
      { listId: 1, groupId: 6, name: "TEST" },
      { listId: 1, groupId: 7, name: "NEGOZIANTI" },
      { listId: 1, groupId: 8, name: "CLIENTI PRIVATI" },
      { listId: 1, groupId: 18, name: "nuove email sisal" },
      { listId: 1, groupId: 20, name: "NUOVI" },
      { listId: 1, groupId: 21, name: "4vape.it" },
      { listId: 1, groupId: 22, name: "4vape.it TC 1" },
      { listId: 1, groupId: 23, name: "4vape.it TC 2" },
      { listId: 1, groupId: 24, name: "4vape.it TC 3" },
    ],
    fields: [
      { id: "campo1", name: "nome" },
      { id: "campo2", name: "cognome" },
      { id: "campo3", name: "azienda" },
      { id: "campo4", name: "città" },
      { id: "campo5", name: "provincia" },
      { id: "campo6", name: "cap" },
      { id: "campo7", name: "regione" },
      { id: "campo8", name: "paese" },
      { id: "campo9", name: "indirizzo" },
      { id: "campo10", name: "fax" },
      { id: "campo11", name: "telefono" },
      { id: "campo12", name: "IDCliente" },
      { id: "campo13", name: "IDUltimoOrdine" },
      { id: "campo14", name: "DataUltimoOrdine" },
      { id: "campo15", name: "TotaleUltimoOrdine" },
      { id: "campo16", name: "IDProdottiUltimoOrdine" },
      { id: "campo17", name: "IDCategorieUltimoOrdine" },
      { id: "campo18", name: "DataUltimoOrdineSpedito" },
      { id: "campo19", name: "IDUltimoOrdineSpedito" },
      { id: "campo20", name: "DataCarrelloAbbandonato" },
      { id: "campo21", name: "TotaleCarrelloAbbandonato" },
      { id: "campo22", name: "IDCarrelloAbbandonato" },
      { id: "campo23", name: "TotaleFatturato" },
      { id: "campo24", name: "TotaleFatturatoUltimi12Mesi" },
      { id: "campo25", name: "TotaleFatturatoUltimi30gg" },
      { id: "campo26", name: "IDTuttiProdottiAcquistati" },
      { id: "campo27", name: "Compleanno" },
    ],
  };
  let mailupTokenCache: { token: string; expiresAt: number } | null = null;

  function getMailupConfig() {
    return {
      clientId: process.env.MAILUP_CLIENT_ID || "",
      clientSecret: process.env.MAILUP_CLIENT_SECRET || "",
      username: process.env.MAILUP_USERNAME || "",
      password: process.env.MAILUP_PASSWORD || "",
      tokenUrl:
        process.env.MAILUP_TOKEN_URL ||
        "https://services.mailup.com/Authorization/OAuth/Token",
      consoleBase:
        process.env.MAILUP_CONSOLE_BASE ||
        "https://services.mailup.com/API/v1.1/Rest/ConsoleService.svc/Console",
    };
  }

  async function getMailupAccessToken() {
    const now = Date.now();
    if (mailupTokenCache && mailupTokenCache.expiresAt > now + 15000) {
      return mailupTokenCache.token;
    }
    const cfg = getMailupConfig();
    if (!cfg.clientId || !cfg.clientSecret || !cfg.username || !cfg.password) {
      throw new Error("Config MailUp incompleta in .env");
    }
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      username: cfg.username,
      password: cfg.password,
    });
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok || !json.access_token) {
      throw new Error(json.error_description || json.error || text || `Token error ${res.status}`);
    }
    const expiresIn = Number(json.expires_in || 3600);
    mailupTokenCache = {
      token: json.access_token,
      expiresAt: now + expiresIn * 1000,
    };
    return json.access_token as string;
  }

  async function mailupRequest(pathOrUrl: string, init?: RequestInit) {
    const cfg = getMailupConfig();
    const token = await getMailupAccessToken();
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${cfg.consoleBase.replace(/\/+$/, "")}/${pathOrUrl.replace(/^\/+/, "")}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        (data && (data.Message || data.message || data.error_description || data.error)) ||
        text ||
        `MailUp error ${res.status}`;
      throw new Error(String(msg));
    }
    return data;
  }

  async function upsertMailupRecipient(params: {
    listId: number;
    groupId?: number | null;
    email: string;
    name?: string;
    fields?: Array<{ Id: string; Value: string }>;
  }) {
    const payload = {
      Confirmed: true,
      Force: true,
      Recipients: [
        {
          Email: params.email,
          Name: params.name || "",
          Fields: params.fields || [],
        },
      ],
      ...(params.groupId ? { Groups: [params.groupId] } : {}),
    };
    try {
      return await mailupRequest(`/List/${params.listId}/Recipients`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      return await mailupRequest(`/List/${params.listId}/Recipient`, {
        method: "POST",
        body: JSON.stringify(payload.Recipients[0]),
      });
    }
  }

  async function createMailupEmail(params: {
    listId: number;
    subject: string;
    name: string;
    html: string;
  }): Promise<number> {
    const payload = {
      Subject: params.subject,
      Name: params.name,
      Content: params.html,
      ContentType: "html",
      Embed: false,
      IsConfirmation: false,
    };
    const data = await mailupRequest(`/List/${params.listId}/Email`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const id = Number(data?.id || data?.Id || data?.IdMessage || data?.Items?.[0]?.Id || 0);
    if (!id) throw new Error("MailUp: impossibile creare email campagna");
    return id;
  }

  async function sendMailupEmail(params: {
    listId: number;
    emailId: number;
    groupId?: number | null;
  }) {
    const payload = {
      ConfirmationEmail: false,
      TrackableLinks: true,
      SaveAsDraft: false,
      ...(params.groupId ? { Groups: [params.groupId] } : {}),
    };
    return mailupRequest(`/List/${params.listId}/Email/${params.emailId}/Send`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

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

  const toNumber = (value: any) => {
    if (value === null || value === undefined || value === "") return undefined;
    const cleaned = String(value).replace(/\s/g, "").replace(",", ".");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
  };

  const toPercent = (value: any) => {
    if (value === null || value === undefined || value === "") return undefined;
    const cleaned = String(value)
      .replace("%", "")
      .replace(/\s/g, "")
      .replace(",", ".");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
  };

  const toBool = (value: any) => {
    if (value === null || value === undefined || value === "") return undefined;
    const v = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "si", "sì"].includes(v)) return true;
    if (["0", "false", "no"].includes(v)) return false;
    return undefined;
  };

  const normalizeKey = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const pick = (row: Record<string, any>, keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined) return row[k];
    }
    return undefined;
  };

  const parseMulti = (value: any) => {
    if (value === null || value === undefined) return [] as string[];
    const raw = String(value).trim();
    if (!raw) return [] as string[];
    return raw
      .split(/[|,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
  };

  async function resolveExciseTotal(
    exciseRateId?: string | null,
    mlProduct?: number | null,
    fallback?: number | null
  ) {
    if (!exciseRateId) return fallback ?? null;
    const rate = await prisma.exciseRate.findUnique({ where: { id: exciseRateId } });
    if (!rate) return fallback ?? null;
    const amount = Number(rate.amount || 0);
    if (rate.type === "ML") {
      const ml = Number(mlProduct || 0);
      return amount * ml;
    }
    return amount;
  }
  app.get("/ping", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return { ok: true };
  });

  app.get("/mail-marketing/meta", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return defaultMailupMeta;
  });

  app.get("/mail-marketing/status", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const cfg = getMailupConfig();
    return {
      configured: Boolean(cfg.clientId && cfg.clientSecret && cfg.username && cfg.password),
      wsUsername: cfg.username || null,
    };
  });

  app.post("/mail-marketing/test", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    try {
      await getMailupAccessToken();
      const lists = await mailupRequest("/List");
      return { ok: true, lists };
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err?.message || "Connessione MailUp fallita" });
    }
  });

  app.get("/mail-marketing/lists", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    try {
      const data = await mailupRequest("/List");
      return { items: data?.Items || data || [] };
    } catch (err: any) {
      return reply.code(400).send({ items: [], error: err?.message || "Errore caricamento liste" });
    }
  });

  app.get("/mail-marketing/groups", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const listId = Number((request.query as any)?.listId || process.env.MAILUP_DEFAULT_LIST_ID || 1);
    try {
      let data: any = null;
      try {
        data = await mailupRequest(`/List/${listId}/Group`);
      } catch {
        data = await mailupRequest(`/Group?ListId=${listId}`);
      }
      return { items: data?.Items || data || [], source: "mailup" };
    } catch (err: any) {
      const fallback = defaultMailupMeta.groups.filter((g) => Number(g.listId) === Number(listId));
      return {
        items: fallback,
        source: "fallback",
        warning: err?.message || "Errore caricamento gruppi da MailUp",
      };
    }
  });

  app.get("/mail-marketing/fields", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return { items: defaultMailupMeta.fields };
  });

  app.post("/mail-marketing/sync/companies", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        listId: z.number().int().positive(),
        groupId: z.number().int().positive().optional(),
        companyIds: z.array(z.string()).optional(),
      })
      .parse(request.body);

    const where: any = { status: "ACTIVE", email: { not: null } };
    if (body.companyIds?.length) where.id = { in: body.companyIds };
    const companies = await prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const results: Array<{ companyId: string; name: string; email: string | null; ok: boolean; error?: string }> = [];
    for (const company of companies) {
      const email = (company.email || "").trim();
      if (!email) {
        results.push({ companyId: company.id, name: company.name, email: null, ok: false, error: "Email mancante" });
        continue;
      }
      const fullName = [company.contactFirstName, company.contactLastName].filter(Boolean).join(" ").trim();
      const fields = [
        { Id: "campo1", Value: company.contactFirstName || "" },
        { Id: "campo2", Value: company.contactLastName || "" },
        { Id: "campo3", Value: company.legalName || company.name || "" },
        { Id: "campo4", Value: company.city || "" },
        { Id: "campo5", Value: company.province || "" },
        { Id: "campo6", Value: company.cap || "" },
        { Id: "campo8", Value: "IT" },
        { Id: "campo9", Value: company.address || "" },
        { Id: "campo11", Value: company.phone || "" },
        { Id: "campo12", Value: company.customerCode || company.id },
      ];
      try {
        await upsertMailupRecipient({
          listId: body.listId,
          groupId: body.groupId,
          email,
          name: fullName || company.name,
          fields,
        });
        results.push({ companyId: company.id, name: company.name, email, ok: true });
      } catch (err: any) {
        results.push({
          companyId: company.id,
          name: company.name,
          email,
          ok: false,
          error: err?.message || "Errore import contatto",
        });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    return { total: results.length, ok, failed, results };
  });

  app.get("/mail-marketing/templates", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.mailMarketingTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/mail-marketing/templates", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        subject: z.string().min(2),
        html: z.string().min(1),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    return prisma.mailMarketingTemplate.create({
      data: {
        name: body.name,
        subject: body.subject,
        html: body.html,
        active: body.active ?? true,
        createdById: user.id,
      },
    });
  });

  app.patch("/mail-marketing/templates/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        subject: z.string().min(2).optional(),
        html: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    return prisma.mailMarketingTemplate.update({
      where: { id },
      data: body,
    });
  });

  app.delete("/mail-marketing/templates/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.mailMarketingTemplate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/mail-marketing/campaigns", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.mailMarketingCampaign.findMany({
      include: { template: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/mail-marketing/history", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const listId = Number((request.query as any)?.listId || process.env.MAILUP_DEFAULT_LIST_ID || 1);
    try {
      let data: any = null;
      try {
        data = await mailupRequest(`/List/${listId}/Email`);
      } catch {
        try {
          data = await mailupRequest(`/List/${listId}/Emails`);
        } catch {
          data = await mailupRequest(`/Email?ListId=${listId}`);
        }
      }
      const items = data?.Items || data || [];
      return { items, source: "mailup" };
    } catch (err: any) {
      return reply.code(400).send({
        items: [],
        source: "mailup",
        error: err?.message || "Errore recupero storico MailUp",
      });
    }
  });

  app.get("/mail-marketing/history/:emailId", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const emailId = Number((request.params as any)?.emailId);
    const listId = Number((request.query as any)?.listId || process.env.MAILUP_DEFAULT_LIST_ID || 1);
    if (!emailId || !listId) return reply.badRequest("Parametri non validi");
    try {
      let data: any = null;
      try {
        data = await mailupRequest(`/List/${listId}/Email/${emailId}`);
      } catch {
        data = await mailupRequest(`/Email/${emailId}?ListId=${listId}`);
      }
      return { item: data || null };
    } catch (err: any) {
      return reply.code(400).send({ item: null, error: err?.message || "Errore recupero dettaglio email" });
    }
  });

  app.post("/mail-marketing/campaigns", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        subject: z.string().min(2),
        html: z.string().min(1),
        templateId: z.string().optional(),
        listId: z.number().int().positive(),
        groupId: z.number().int().positive().optional(),
        audienceType: z.enum(["ALL_ACTIVE", "SELECTED_COMPANIES"]).default("ALL_ACTIVE"),
        audienceCompanyIds: z.array(z.string()).optional(),
        scheduledAt: z.string().optional(),
      })
      .parse(request.body);
    return prisma.mailMarketingCampaign.create({
      data: {
        name: body.name,
        subject: body.subject,
        html: body.html,
        templateId: body.templateId || null,
        listId: body.listId,
        groupId: body.groupId || null,
        audienceType: body.audienceType,
        audienceCompanyIds: body.audienceCompanyIds || [],
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
        createdById: user.id,
      },
    });
  });

  app.patch("/mail-marketing/campaigns/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        subject: z.string().min(2).optional(),
        html: z.string().min(1).optional(),
        listId: z.number().int().positive().optional(),
        groupId: z.number().int().positive().nullable().optional(),
        audienceType: z.enum(["ALL_ACTIVE", "SELECTED_COMPANIES"]).optional(),
        audienceCompanyIds: z.array(z.string()).optional(),
        scheduledAt: z.string().nullable().optional(),
        status: z.enum(["DRAFT", "SCHEDULED"]).optional(),
      })
      .parse(request.body);
    return prisma.mailMarketingCampaign.update({
      where: { id },
      data: {
        ...body,
        ...(body.scheduledAt !== undefined
          ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }
          : {}),
      },
    });
  });

  app.delete("/mail-marketing/campaigns/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.mailMarketingCampaign.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/mail-marketing/campaigns/:id/send", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const campaign = await prisma.mailMarketingCampaign.findUnique({ where: { id } });
    if (!campaign) return reply.notFound("Campagna non trovata");

    const companyWhere: any = { status: "ACTIVE", email: { not: null } };
    if (campaign.audienceType === "SELECTED_COMPANIES") {
      const ids = Array.isArray(campaign.audienceCompanyIds) ? campaign.audienceCompanyIds : [];
      if (!ids.length) return reply.badRequest("Pubblico vuoto");
      companyWhere.id = { in: ids as string[] };
    }
    const recipients = await prisma.company.findMany({
      where: companyWhere,
      orderBy: { createdAt: "desc" },
    });
    if (!recipients.length) return reply.badRequest("Nessun destinatario valido");

    let ok = 0;
    let failed = 0;
    for (const company of recipients) {
      const email = (company.email || "").trim();
      if (!email) {
        failed += 1;
        continue;
      }
      const fields = [
        { Id: "campo1", Value: company.contactFirstName || "" },
        { Id: "campo2", Value: company.contactLastName || "" },
        { Id: "campo3", Value: company.legalName || company.name || "" },
        { Id: "campo4", Value: company.city || "" },
        { Id: "campo5", Value: company.province || "" },
        { Id: "campo6", Value: company.cap || "" },
        { Id: "campo8", Value: "IT" },
        { Id: "campo9", Value: company.address || "" },
        { Id: "campo11", Value: company.phone || "" },
        { Id: "campo12", Value: company.customerCode || company.id },
      ];
      try {
        await upsertMailupRecipient({
          listId: campaign.listId,
          groupId: campaign.groupId,
          email,
          name:
            [company.contactFirstName, company.contactLastName].filter(Boolean).join(" ").trim() ||
            company.name,
          fields,
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }

    if (!ok) {
      await prisma.mailMarketingCampaign.update({
        where: { id: campaign.id },
        data: { status: "FAILED", failedCount: failed, lastError: "Nessun destinatario sincronizzato su MailUp" },
      });
      return reply.code(400).send({ ok: false, error: "Nessun destinatario valido" });
    }

    try {
      const emailId = await createMailupEmail({
        listId: campaign.listId,
        subject: campaign.subject,
        name: campaign.name,
        html: campaign.html,
      });
      const sendRes = await sendMailupEmail({
        listId: campaign.listId,
        emailId,
        groupId: campaign.groupId,
      });
      const sendId = sendRes?.id || sendRes?.Id || sendRes?.Message || null;
      await prisma.mailMarketingCampaign.update({
        where: { id: campaign.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          recipientCount: recipients.length,
          sentCount: ok,
          failedCount: failed,
          mailupEmailId: emailId,
          mailupSendId: sendId ? String(sendId) : null,
          lastError: null,
        },
      });
      return { ok: true, emailId, sendId, recipients: recipients.length, synced: ok, failed };
    } catch (err: any) {
      await prisma.mailMarketingCampaign.update({
        where: { id: campaign.id },
        data: {
          status: "FAILED",
          recipientCount: recipients.length,
          sentCount: ok,
          failedCount: failed,
          lastError: err?.message || "Invio MailUp fallito",
        },
      });
      return reply.code(400).send({ ok: false, error: err?.message || "Invio fallito" });
    }
  });

  app.get("/users/pending", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.user.findMany({
      where: { approved: false },
      include: { company: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.get("/users", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.user.findMany({
      include: { company: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/companies", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        vatNumber: z.string().min(1),
        contactFirstName: z.string().min(1),
        contactLastName: z.string().min(1),
        legalName: z.string().min(1),
        sdiCode: z.string().min(1),
        address: z.string().min(1),
        cap: z.string().min(1),
        city: z.string().min(1),
        province: z.string().min(1),
        phone: z.string().min(1),
        email: z.string().min(1),
        customerCode: z.string().optional(),
        pec: z.string().optional(),
        licenseNumber: z.string().optional(),
        cmnr: z.string().optional(),
        signNumber: z.string().optional(),
        adminVatNumber: z.string().optional(),
        groupName: z.string().optional(),
      })
      .parse(request.body);
    const created = await prisma.company.create({
      data: {
        name: body.name,
        vatNumber: body.vatNumber,
        status: "ACTIVE",
        contactFirstName: body.contactFirstName,
        contactLastName: body.contactLastName,
        legalName: body.legalName,
        sdiCode: body.sdiCode,
        address: body.address,
        cap: body.cap,
        city: body.city,
        province: body.province,
        phone: body.phone,
        email: body.email,
        customerCode: body.customerCode || null,
        pec: body.pec || null,
        licenseNumber: body.licenseNumber || null,
        cmnr: body.cmnr || null,
        signNumber: body.signNumber || null,
        adminVatNumber: body.adminVatNumber || null,
        groupName: body.groupName || null,
      },
    });
    return reply.code(201).send(created);
  });

  app.patch("/companies/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        vatNumber: z.string().min(1).nullable().optional(),
        contactFirstName: z.string().min(1).nullable().optional(),
        contactLastName: z.string().min(1).nullable().optional(),
        legalName: z.string().min(1).nullable().optional(),
        sdiCode: z.string().min(1).nullable().optional(),
        address: z.string().min(1).nullable().optional(),
        cap: z.string().min(1).nullable().optional(),
        city: z.string().min(1).nullable().optional(),
        province: z.string().min(1).nullable().optional(),
        phone: z.string().min(1).nullable().optional(),
        email: z.string().min(1).nullable().optional(),
        customerCode: z.string().nullable().optional(),
        pec: z.string().nullable().optional(),
        licenseNumber: z.string().nullable().optional(),
        cmnr: z.string().nullable().optional(),
        signNumber: z.string().nullable().optional(),
        adminVatNumber: z.string().nullable().optional(),
        groupName: z.string().nullable().optional(),
        status: z.string().optional(),
      })
      .parse(request.body);
    return prisma.company.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber || null } : {}),
        ...(body.contactFirstName !== undefined
          ? { contactFirstName: body.contactFirstName || null }
          : {}),
        ...(body.contactLastName !== undefined ? { contactLastName: body.contactLastName || null } : {}),
        ...(body.legalName !== undefined ? { legalName: body.legalName || null } : {}),
        ...(body.sdiCode !== undefined ? { sdiCode: body.sdiCode || null } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
        ...(body.cap !== undefined ? { cap: body.cap || null } : {}),
        ...(body.city !== undefined ? { city: body.city || null } : {}),
        ...(body.province !== undefined ? { province: body.province || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.customerCode !== undefined ? { customerCode: body.customerCode || null } : {}),
        ...(body.pec !== undefined ? { pec: body.pec || null } : {}),
        ...(body.licenseNumber !== undefined ? { licenseNumber: body.licenseNumber || null } : {}),
        ...(body.cmnr !== undefined ? { cmnr: body.cmnr || null } : {}),
        ...(body.signNumber !== undefined ? { signNumber: body.signNumber || null } : {}),
        ...(body.adminVatNumber !== undefined ? { adminVatNumber: body.adminVatNumber || null } : {}),
        ...(body.groupName !== undefined ? { groupName: body.groupName || null } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });
  });

  app.delete("/companies/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const orders = await prisma.order.count({ where: { companyId: id } });
    if (orders > 0) return reply.code(409).send({ error: "Company has orders" });
    await prisma.user.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.patch("/users/:id/approve", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const updated = await prisma.user.update({ where: { id }, data: { approved: true } });
    if (updated.companyId) {
      await prisma.company.update({
        where: { id: updated.companyId },
        data: { status: "ACTIVE" },
      });
    }
    return updated;
  });

  app.delete("/users/:id/reject", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.code(204).send();
    const companyId = existing.companyId;
    await prisma.user.delete({ where: { id } });
    if (companyId) {
      const remaining = await prisma.user.count({ where: { companyId } });
      if (remaining === 0) {
        try {
          await prisma.company.delete({ where: { id: companyId } });
        } catch {
          // company might be linked to orders; ignore to allow rejection
        }
      }
    }
    return reply.code(204).send();
  });

  app.get("/companies", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const companies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      include: {
        users: {
          select: {
            id: true,
            lastLoginAt: true,
          },
        },
      },
    });

    const revenueStatuses = ["APPROVED", "FULFILLED"] as const;
    const countableStatuses = ["SUBMITTED", "APPROVED", "FULFILLED"] as const;
    const companyIds = companies.map((c) => c.id);

    const [countAgg, revenueAgg] = await Promise.all([
      prisma.order.groupBy({
        by: ["companyId"],
        where: {
          companyId: { in: companyIds },
          status: { in: countableStatuses as any },
        },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ["companyId"],
        where: {
          companyId: { in: companyIds },
          status: { in: revenueStatuses as any },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map(countAgg.map((r) => [r.companyId, r._count?._all || 0]));
    const revenueMap = new Map(
      revenueAgg.map((r) => [
        r.companyId,
        {
          revenue: Number(r._sum?.total || 0),
          paidOrders: r._count?._all || 0,
        },
      ])
    );

    return companies.map((c) => {
      const accessDates = c.users
        .map((u) => u.lastLoginAt)
        .filter((v): v is Date => Boolean(v))
        .sort((a, b) => b.getTime() - a.getTime());
      const lastAccessAt = accessDates[0] || null;
      const orders = countMap.get(c.id) || 0;
      const revenueRow = revenueMap.get(c.id) || { revenue: 0, paidOrders: 0 };
      const averageOrderValue = revenueRow.paidOrders ? revenueRow.revenue / revenueRow.paidOrders : 0;
      return {
        ...c,
        users: undefined,
        stats: {
          lastAccessAt,
          registeredAt: c.createdAt,
          orders,
          revenue: revenueRow.revenue,
          averageOrderValue,
        },
      };
    });
  });

  app.get("/orders", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as any;
    const status = query?.status as string | undefined;
    const companyId = query?.companyId as string | undefined;
    const paymentMethod = query?.paymentMethod as string | undefined;
    const groupName = query?.groupName as string | undefined;
    const start = query?.start as string | undefined;
    const end = query?.end as string | undefined;
    const where: Prisma.OrderWhereInput = {};
    if (status && status !== "ALL") where.status = status as any;
    if (companyId) where.companyId = companyId;
    if (paymentMethod && paymentMethod !== "ALL") where.paymentMethod = paymentMethod as any;
    if (groupName && groupName !== "ALL") where.company = { groupName };
    if (start || end) {
      where.createdAt = {
        ...(start ? { gte: new Date(`${start}T00:00:00.000Z`) } : {}),
        ...(end ? { lte: new Date(`${end}T23:59:59.999Z`) } : {}),
      };
    }
    return prisma.order.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        company: true,
        createdBy: true,
        items: {
          include: {
            product: {
              include: { sourceSupplier: true, taxRateRef: true },
            },
          },
        },
      },
    });
  });

  app.get("/orders/stats", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const grouped = await prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const map = new Map(grouped.map((g) => [g.status, g._count._all || 0]));
    const statuses = ["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"] as const;
    return statuses.map((status) => ({ status, count: map.get(status) || 0 }));
  });

  app.post("/orders", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        companyId: z.string().min(1),
        status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"]).optional(),
        paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "COD", "OTHER"]).optional(),
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
        __taxRate: Number(product.taxRate || 0),
        __exciseUnit: Number(
          product.exciseTotal ?? (Number(product.exciseMl || 0) + Number(product.exciseProduct || 0))
        ),
      };
    });

    const subtotal = items.reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
    const vatTotal = items.reduce((sum, i: any) => {
      const rate = Number(i.__taxRate || 0);
      const exciseLine = Number(i.__exciseUnit || 0) * Number(i.qty || 0);
      const base = Number(i.lineTotal) + exciseLine;
      return sum + (rate > 0 ? base * (rate / 100) : 0);
    }, 0);
    const exciseTotal = items.reduce(
      (sum, i: any) => sum + Number(i.__exciseUnit || 0) * Number(i.qty || 0),
      0
    );
    const discountTotal = body.discountTotal ? new Prisma.Decimal(body.discountTotal) : new Prisma.Decimal(0);
    const gross = subtotal.add(new Prisma.Decimal(vatTotal)).add(new Prisma.Decimal(exciseTotal));
    const total = Prisma.Decimal.max(gross.sub(discountTotal), new Prisma.Decimal(0));

    const maxOrderRow = await prisma.order.aggregate({
      _max: { orderNumber: true },
    });
    const nextOrderNumber = Math.max(20000, Number(maxOrderRow._max.orderNumber || 19999) + 1);

    const order = await prisma.order.create({
      data: {
        orderNumber: nextOrderNumber,
        companyId: company.id,
        createdById: user.id,
        status: body.status ?? "SUBMITTED",
        paymentMethod: body.paymentMethod ?? "BANK_TRANSFER",
        total,
        discountTotal,
        items: {
          create: items.map(({ __taxRate, __exciseUnit, ...rest }: any) => rest),
        },
      },
      include: { company: true, items: true },
    });

    return reply.code(201).send(order);
  });

  app.patch("/orders/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"]).optional(),
        paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "COD", "OTHER"]).optional(),
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
          __taxRate: Number(product.taxRate || 0),
          __exciseUnit: Number(
            product.exciseTotal ?? (Number(product.exciseMl || 0) + Number(product.exciseProduct || 0))
          ),
        };
      });
      const subtotal = itemsPayload.reduce(
        (sum, i) => sum.add(new Prisma.Decimal(i.lineTotal as any)),
        new Prisma.Decimal(0)
      );
      const vatTotal = itemsPayload.reduce((sum: number, i: any) => {
        const rate = Number(i.__taxRate || 0);
        const exciseLine = Number(i.__exciseUnit || 0) * Number(i.qty || 0);
        const base = Number(i.lineTotal) + exciseLine;
        return sum + (rate > 0 ? base * (rate / 100) : 0);
      }, 0);
      const exciseTotal = itemsPayload.reduce(
        (sum: number, i: any) => sum + Number(i.__exciseUnit || 0) * Number(i.qty || 0),
        0
      );
      const discountValue = discountTotal || new Prisma.Decimal(0);
      const gross = subtotal.add(new Prisma.Decimal(vatTotal)).add(new Prisma.Decimal(exciseTotal));
      total = Prisma.Decimal.max(gross.sub(discountValue), new Prisma.Decimal(0));
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: body.status ?? existing.status,
          paymentMethod: body.paymentMethod ?? existing.paymentMethod,
          companyId: body.companyId ?? existing.companyId,
          discountTotal,
          total,
          items: itemsPayload
            ? {
                deleteMany: {},
                createMany: {
                  data: itemsPayload.map(({ __taxRate, __exciseUnit, ...rest }: any) => rest),
                },
              }
            : undefined,
        },
        include: { items: true, company: true },
      });
      return updated;
    });
  });

  app.delete("/orders/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId: id } }),
      prisma.order.delete({ where: { id } }),
    ]);
    return reply.code(204).send();
  });

  app.patch("/orders/bulk-status", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1),
        status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELLED"]),
      })
      .parse(request.body);
    const result = await prisma.order.updateMany({
      where: { id: { in: body.ids } },
      data: { status: body.status },
    });
    return { updated: result.count };
  });

  app.get("/products", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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

  app.get("/products/:id/customer-prices", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const productId = (request.params as any).id as string;
    const rows = await prisma.productPrice.findMany({
      where: { productId },
      include: { company: { select: { id: true, name: true, status: true } } },
      orderBy: { companyId: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.company?.name || "N/D",
      companyStatus: r.company?.status || "N/D",
      price: Number(r.price || 0),
    }));
  });

  app.put("/products/:id/customer-prices/:companyId", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const productId = (request.params as any).id as string;
    const companyId = (request.params as any).companyId as string;
    const body = z.object({ price: z.number().positive() }).parse(request.body);
    const [product, company] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
    ]);
    if (!product) return reply.notFound("Product not found");
    if (!company) return reply.notFound("Company not found");
    const row = await prisma.productPrice.upsert({
      where: { companyId_productId: { companyId, productId } },
      create: { companyId, productId, price: new Prisma.Decimal(body.price) },
      update: { price: new Prisma.Decimal(body.price) },
    });
    return { id: row.id, companyId: row.companyId, productId: row.productId, price: Number(row.price) };
  });

  app.delete("/products/:id/customer-prices/:companyId", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const productId = (request.params as any).id as string;
    const companyId = (request.params as any).companyId as string;
    await prisma.productPrice.deleteMany({
      where: { productId, companyId },
    });
    return reply.code(204).send();
  });

  app.get("/products/export", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const products = await prisma.product.findMany({
      include: { taxRateRef: true, exciseRateRef: true, parent: true, sourceSupplier: true },
      orderBy: { createdAt: "desc" },
    });
    const allCategories = await prisma.category.findMany({ select: { id: true, name: true } });
    const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
    const header = [
      "SKU",
      "NOME",
      "PREZZO",
      "GIACENZA",
      "BRAND",
      "CATEGORIA",
      "SOTTOCATEGORIA",
      "AROMA",
      "PADRE_SKU",
      "IS_PADRE",
      "VENDUTO_ANCHE_SINGOLARMENTE",
      "NON_DISPONIBILE",
      "DRAFT",
      "DESCRIZIONE_BREVE",
      "DESCRIZIONE",
      "ML_PRODOTTO",
      "NICOTINA",
      "IVA",
      "ACCISA",
      "ACCISA_CALCOLATA",
      "PREZZO_ACQUISTO",
      "PREZZO_LISTINO",
      "PREZZO_SCONTATO",
      "QTA_SCONTO",
      "BARCODE",
      "PRODOTTI_CORRELATI_SKU",
      "FORNITORE",
    ];
    const escape = (v: any) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/\"/g, "\"\"")}"`;
      }
      return s;
    };
    const rows = products.map((p) => [
      p.sku,
      p.name,
      p.price,
      p.stockQty,
      p.brand,
      Array.isArray(p.categoryIds) && p.categoryIds.length
        ? p.categoryIds
            .map((id: any) => categoryNameById.get(String(id)) || "")
            .filter(Boolean)
            .join("|")
        : p.category || "",
      Array.isArray(p.subcategories) && p.subcategories.length
        ? p.subcategories.join("|")
        : p.subcategory || "",
      p.aroma || "",
      p.parent?.sku || "",
      p.isParent ? "1" : "0",
      p.sellAsSingle ? "1" : "0",
      p.isUnavailable ? "1" : "0",
      p.published === false ? "1" : "0",
      p.shortDescription || "",
      p.description || "",
      p.mlProduct ?? "",
      p.nicotine ?? "",
      p.taxRateRef?.rate ?? p.taxRate ?? "",
      p.exciseRateRef?.name || "",
      p.exciseTotal ?? "",
      p.purchasePrice ?? "",
      p.listPrice ?? "",
      p.discountPrice ?? "",
      p.discountQty ?? "",
      p.barcode || "",
      Array.isArray(p.relatedProductIds)
        ? p.relatedProductIds
            .map((id: any) => products.find((x) => x.id === id)?.sku)
            .filter(Boolean)
            .join("|")
        : "",
      p.sourceSupplier?.name || "",
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="products_export.csv"');
    return reply.send(csv);
  });

  app.post("/products/import", async (request, reply) => {
    // CHECKLIST (admin richieste):
    // [x] Update giacenza via CSV anche con colonne quantita/qta/qty
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const file = await request.file();
    if (!file) return reply.badRequest("File mancante");
    const buf = await file.toBuffer();
    const text = buf.toString("utf8");
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const records = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter,
      trim: true,
    });

    const categories = await prisma.category.findMany();
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const taxRates = await prisma.taxRate.findMany();
    const taxByRate = new Map(taxRates.map((t) => [Number(t.rate), t]));
    const exciseRates = await prisma.exciseRate.findMany();
    const exciseByName = new Map(exciseRates.map((e) => [e.name.toLowerCase(), e]));

    let updated = 0;
    let skipped = 0;

    for (const raw of records) {
      const row: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        row[normalizeKey(String(k).trim())] = v;
      }
      const sku = pick(row, ["sku", "codice", "codice_sku"]);
      if (!sku) {
        skipped += 1;
        continue;
      }
      const product = await prisma.product.findUnique({ where: { sku: String(sku).trim() } });
      if (!product) {
        skipped += 1;
        continue;
      }

      const data: any = {};
      const name = pick(row, ["name", "nome"]);
      if (name) data.name = String(name).trim();
      const price = toNumber(pick(row, ["price", "prezzo"]));
      if (price !== undefined) data.price = price;
      const stockQty = toNumber(
        pick(row, ["stockqty", "giacenza", "magazzino", "quantita", "qta", "qty"])
      );
      if (stockQty !== undefined) data.stockQty = Math.max(0, Math.floor(stockQty));
      const brand = pick(row, ["brand", "marca", "marchi"]);
      if (brand) data.brand = String(brand).trim();
      const shortDescription = pick(row, ["shortdescription", "breve_descrizione", "descrizionebreve"]);
      if (shortDescription) data.shortDescription = String(shortDescription);
      const description = pick(row, ["description", "descrizione"]);
      if (description) data.description = String(description);
      const aroma = pick(row, ["aroma", "nome_aroma"]);
      if (aroma) data.aroma = String(aroma).trim();
      const draft = toBool(pick(row, ["draft", "bozza"]));
      if (draft !== undefined) data.published = !draft;
      const barcode = pick(row, ["barcode", "ean", "codice_a_barre"]);
      if (barcode) data.barcode = String(barcode).trim();
      const relatedSkusRaw = pick(row, ["relatedskus", "prodotticorrelati", "related_products"]);
      if (relatedSkusRaw) {
        const skuList = String(relatedSkusRaw)
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        if (skuList.length) {
          const related = await prisma.product.findMany({
            where: { sku: { in: skuList } },
            select: { id: true },
          });
          data.relatedProductIds = related.map((r) => r.id);
        } else {
          data.relatedProductIds = [];
        }
      }

      const kind = String(pick(row, ["prodotto", "tipo_prodotto"]) || "").toLowerCase();
      const isParent = kind.includes("padre") ? true : toBool(pick(row, ["isparent", "padre"]));
      if (isParent !== undefined) data.isParent = isParent;
      const sellAsSingle = toBool(
        pick(row, ["sellassingle", "venduto_anche_singolarmente", "figlio_singolo", "figliosingolo"])
      );
      if (sellAsSingle !== undefined) data.sellAsSingle = sellAsSingle;
      const isUnavailable = toBool(pick(row, ["isunavailable", "non_disponibile"]));
      if (isUnavailable !== undefined) data.isUnavailable = isUnavailable;

      const mlProduct = toNumber(pick(row, ["mlproduct", "ml_prodotto", "ml"]));
      if (mlProduct !== undefined) data.mlProduct = mlProduct;
      const nicotine = toNumber(pick(row, ["nicotine", "nicotina"]));
      if (nicotine !== undefined) data.nicotine = nicotine;

      const categoryName = pick(row, ["category", "categoria", "categorie"]);
      if (categoryName) {
        const parts = parseMulti(categoryName);
        const resolvedIds: string[] = [];
        const resolvedNames: string[] = [];
        for (const part of parts) {
          const cat = categoryByName.get(String(part).toLowerCase());
          if (cat) {
            resolvedIds.push(cat.id);
            resolvedNames.push(cat.name);
          } else {
            resolvedNames.push(part);
          }
        }
        if (resolvedIds.length) data.categoryIds = resolvedIds;
        if (resolvedIds[0]) data.categoryId = resolvedIds[0];
        if (resolvedNames.length) data.category = resolvedNames[0];
      }

      const parentSku = pick(row, ["parentsku", "padresku", "padre"]);
      if (parentSku) {
        const parent = await prisma.product.findUnique({ where: { sku: String(parentSku).trim() } });
        if (parent) data.parentId = parent.id;
      }

      const taxRate = toPercent(pick(row, ["taxrate", "aliquota_di_imposta", "iva"]));
      if (taxRate !== undefined) {
        const t = taxByRate.get(taxRate);
        if (t) data.taxRateId = t.id;
      }

      const exciseRateName = pick(row, ["exciserate", "accisa"]);
      if (exciseRateName) {
        const e = exciseByName.get(String(exciseRateName).toLowerCase());
        if (e) data.exciseRateId = e.id;
      }

      const exciseMl = toNumber(pick(row, ["accisa_ml", "excise_ml"]));
      if (exciseMl !== undefined) data.exciseMl = exciseMl;
      const exciseProduct = toNumber(pick(row, ["accisa_prodotto", "excise_product"]));
      if (exciseProduct !== undefined) data.exciseProduct = exciseProduct;
      const exciseTotal = toNumber(pick(row, ["excisetotal", "accisa_calcolata"]));
      if (exciseTotal !== undefined) data.exciseTotal = exciseTotal;

      const imageValue = pick(row, ["immagine", "immagini", "image", "image_urls"]);
      if (imageValue) {
        const parts = String(imageValue)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length) {
          data.imageUrl = parts[0];
          data.imageUrls = parts;
        }
      }

      const purchasePrice = toNumber(pick(row, ["prezzo_di_acquisto", "purchase_price"]));
      if (purchasePrice !== undefined) data.purchasePrice = purchasePrice;
      const listPrice = toNumber(pick(row, ["prezzo_di_listino", "list_price"]));
      if (listPrice !== undefined) data.listPrice = listPrice;
      const discountPrice = toNumber(
        pick(row, ["prezzi_scontato_per_quantita", "prezzo_scontato", "discount_price"])
      );
      if (discountPrice !== undefined) data.discountPrice = discountPrice;
      const discountQty = toNumber(pick(row, ["quantita_per_sconto", "discount_qty"]));
      if (discountQty !== undefined) data.discountQty = discountQty;

      const subcategory = pick(row, ["sottocategorie", "sottocategoria", "subcategory"]);
      if (subcategory) {
        const parts = parseMulti(subcategory);
        if (parts.length) {
          data.subcategory = parts[0];
          data.subcategories = parts;
        }
      }

      if (
        data.exciseRateId !== undefined ||
        data.mlProduct !== undefined ||
        data.exciseTotal !== undefined
      ) {
        const exciseRateIdFinal =
          data.exciseRateId !== undefined ? data.exciseRateId : product.exciseRateId;
        const mlFinal = data.mlProduct !== undefined ? data.mlProduct : product.mlProduct;
        const fallback = data.exciseTotal !== undefined ? data.exciseTotal : product.exciseTotal;
        data.exciseTotal = await resolveExciseTotal(exciseRateIdFinal, mlFinal, fallback);
      } else if (data.exciseMl !== undefined || data.exciseProduct !== undefined) {
        const mlFinal = data.mlProduct ?? product.mlProduct ?? 0;
        const exciseLine =
          Number(data.exciseMl ?? product.exciseMl ?? 0) * Number(mlFinal) +
          Number(data.exciseProduct ?? product.exciseProduct ?? 0);
        data.exciseTotal = exciseLine;
      }

      if (Object.keys(data).length === 0) {
        skipped += 1;
        continue;
      }
      await prisma.product.update({ where: { id: product.id }, data });
      updated += 1;
    }

    return { updated, skipped };
  });

  app.get("/products/stock", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        source: true,
        sourceSupplierId: true,
        stockQty: true,
        isUnavailable: true,
      },
    });
    const supplierProducts = await prisma.supplierProduct.findMany({
      select: { supplierId: true, supplierSku: true, stockQty: true },
    });
    const supplierStockMap = new Map(
      supplierProducts.map((sp) => [`${sp.supplierId}::${sp.supplierSku}`, sp.stockQty ?? null])
    );
    return products.map((p) => {
      if (p.source === "SUPPLIER" && p.sourceSupplierId) {
        const key = `${p.sourceSupplierId}::${p.sku}`;
        const supplierQty = supplierStockMap.get(key);
        if (supplierQty !== undefined && supplierQty !== null) {
          return {
            id: p.id,
            stockQty: supplierQty,
            isUnavailable: Number(supplierQty) <= 0,
          };
        }
      }
      return { id: p.id, stockQty: p.stockQty, isUnavailable: p.isUnavailable };
    });
  });

  app.post("/products", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        sku: z.string().min(1),
        name: z.string().min(2),
        description: z.string().optional(),
        brand: z.string().optional(),
        aroma: z.string().optional(),
        category: z.string().optional(),
        categoryId: z.string().optional(),
        categoryIds: z.array(z.string()).optional(),
        parentId: z.string().optional(),
        isParent: z.boolean().optional(),
        sellAsSingle: z.boolean().optional(),
        isUnavailable: z.boolean().optional(),
        shortDescription: z.string().optional(),
        subcategory: z.string().optional(),
        subcategories: z.array(z.string()).optional(),
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
        relatedProductIds: z.array(z.string()).optional(),
        price: z.number().nonnegative().optional(),
        stockQty: z.number().int().nonnegative().default(0),
        imageUrl: z.string().optional(),
      })
      .parse(request.body);

    if (!body.isParent && body.price === undefined) {
      return reply.badRequest("Price is required");
    }

    const sellAsSingle =
      body.sellAsSingle !== undefined ? body.sellAsSingle : body.isParent ? false : true;

    const explicitCategoryIds = (body.categoryIds || []).filter(Boolean);
    const firstCategoryId = body.categoryId || explicitCategoryIds[0];
    let categoryName = body.category;
    if (firstCategoryId) {
      const category = await prisma.category.findUnique({ where: { id: firstCategoryId } });
      if (!category) return reply.badRequest("Category not found");
      categoryName = category.name;
    }
    try {
      const defaultTaxRateId = await resolveDefaultTaxRateId();
      const exciseTotal = await resolveExciseTotal(
        body.exciseRateId,
        body.mlProduct ?? null,
        body.exciseTotal ?? null
      );
      return await prisma.product.create({
        data: {
          ...body,
          aroma: body.aroma,
          category: categoryName,
          categoryId: firstCategoryId || null,
          categoryIds: explicitCategoryIds.length ? explicitCategoryIds : firstCategoryId ? [firstCategoryId] : undefined,
          parentId: body.parentId || null,
          isParent: body.isParent ?? false,
          sellAsSingle,
          isUnavailable: body.isUnavailable ?? false,
          shortDescription: body.shortDescription,
          subcategory: body.subcategory || body.subcategories?.[0] || null,
          subcategories:
            body.subcategories && body.subcategories.length
              ? body.subcategories
              : body.subcategory
                ? [body.subcategory]
                : undefined,
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
          exciseTotal: exciseTotal ?? body.exciseTotal,
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
          relatedProductIds: body.relatedProductIds,
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        brand: z.string().optional(),
        aroma: z.string().optional(),
        category: z.string().optional(),
        categoryId: z.string().nullable().optional(),
        categoryIds: z.array(z.string()).optional(),
        parentId: z.string().nullable().optional(),
        isParent: z.boolean().optional(),
        sellAsSingle: z.boolean().optional(),
        isUnavailable: z.boolean().optional(),
        shortDescription: z.string().optional(),
        subcategory: z.string().optional(),
        subcategories: z.array(z.string()).optional(),
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
        relatedProductIds: z.array(z.string()).optional(),
        price: z.number().nonnegative().optional(),
        stockQty: z.number().int().nonnegative().optional(),
        imageUrl: z.string().optional(),
      })
      .parse(request.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw app.httpErrors.notFound("Product not found");

    const data: any = { ...body };
    if (body.categoryIds !== undefined || body.categoryId !== undefined) {
      const explicitCategoryIds = (body.categoryIds || []).filter(Boolean);
      const firstCategoryId =
        body.categoryId !== undefined ? body.categoryId : explicitCategoryIds[0] || null;
      if (firstCategoryId) {
        const category = await prisma.category.findUnique({ where: { id: firstCategoryId } });
        if (!category) return reply.badRequest("Category not found");
        data.categoryId = firstCategoryId;
        data.category = category.name;
        data.categoryIds = explicitCategoryIds.length ? explicitCategoryIds : [firstCategoryId];
      } else {
        data.categoryId = null;
        data.category = null;
        data.categoryIds = Prisma.JsonNull;
      }
    }
    if (body.subcategories !== undefined) {
      data.subcategories = body.subcategories.length ? body.subcategories : Prisma.JsonNull;
      data.subcategory = body.subcategories.length ? body.subcategories[0] : null;
    } else if (body.subcategory !== undefined) {
      data.subcategory = body.subcategory || null;
      data.subcategories = body.subcategory ? [body.subcategory] : Prisma.JsonNull;
    }
    if (body.aroma !== undefined) data.aroma = body.aroma || null;
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.isParent !== undefined) data.isParent = body.isParent;
    if (body.sellAsSingle !== undefined) data.sellAsSingle = body.sellAsSingle;
    if (body.isUnavailable !== undefined) data.isUnavailable = body.isUnavailable;
    data.vatIncluded = true;
    if (body.taxRateId !== undefined) data.taxRateId = body.taxRateId;
    if (body.exciseRateId !== undefined) data.exciseRateId = body.exciseRateId;
    if (body.relatedProductIds !== undefined) data.relatedProductIds = body.relatedProductIds;

    if (
      body.exciseRateId !== undefined ||
      body.mlProduct !== undefined ||
      body.exciseTotal !== undefined
    ) {
      const exciseRateId =
        data.exciseRateId !== undefined ? data.exciseRateId : existing.exciseRateId;
      const mlProduct = data.mlProduct !== undefined ? data.mlProduct : existing.mlProduct;
      const fallback =
        data.exciseTotal !== undefined ? data.exciseTotal : existing.exciseTotal;
      data.exciseTotal = await resolveExciseTotal(exciseRateId, mlProduct, fallback);
    }
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
    const user = await requireAdmin(request, reply);
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
            sellAsSingle: z.boolean().optional(),
            parentId: z.string().nullable().optional(),
            parentSort: z.number().nullable().optional(),
            relatedProductIds: z.array(z.string()).nullable().optional(),
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
          ...(row.sellAsSingle !== undefined ? { sellAsSingle: row.sellAsSingle } : {}),
          ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
          ...(row.parentSort !== undefined ? { parentSort: row.parentSort ?? undefined } : {}),
          ...(row.relatedProductIds !== undefined
            ? { relatedProductIds: row.relatedProductIds ?? undefined }
            : {}),
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    return prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } });
  });

  app.post("/products/:id/images", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { id, imageId } = request.params as any;
    const image = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image || image.productId !== id) return reply.notFound("Image not found");
    await prisma.productImage.delete({ where: { id: imageId } });
    return reply.code(204).send();
  });

  app.delete("/products/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        children: { select: { id: true } },
        orderItems: { select: { id: true }, take: 1 },
      },
    });
    if (!product) return reply.notFound("Prodotto non trovato");

    // Product is referenced by historical orders: do not hard-delete.
    if (product.orderItems.length > 0) {
      return reply.code(409).send({
        message:
          "Impossibile eliminare: prodotto presente in ordini esistenti. Impostalo come non disponibile o non pubblicato.",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (product.children.length > 0) {
          await tx.product.updateMany({
            where: { parentId: id },
            data: { parentId: null, parentSort: 0 },
          });
        }
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.product.delete({ where: { id } });
      });
      return reply.code(204).send();
    } catch (err: any) {
      if (err?.code === "P2003") {
        return reply.code(409).send({
          message:
            "Impossibile eliminare il prodotto perché è collegato ad altri record.",
        });
      }
      throw err;
    }
  });

  app.get("/suppliers", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = 14;
    const startRange = new Date(startOfToday);
    startRange.setDate(startRange.getDate() - (days - 1));
    const revenueStatuses: OrderStatus[] = ["APPROVED", "FULFILLED"];

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
        revenue: Number(totalRevenueAgg._sum?.total || 0),
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
    // CHECKLIST (admin richieste):
    // [x] Flussi cassa = vendite - spese (arrivi merce da goods receipts)
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string; productId?: string };
    const now = new Date();
    const end = query.end ? new Date(`${query.end}T23:59:59.999Z`) : now;
    const start = query.start ? new Date(`${query.start}T00:00:00.000Z`) : new Date(end);
    if (!query.start) start.setDate(end.getDate() - 29);
    const selectedProductId = String(query.productId || "").trim();
    const revenueStatuses: OrderStatus[] = ["APPROVED", "FULFILLED"];

    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
        status: { in: revenueStatuses },
      },
      include: {
        company: {
          select: { name: true, province: true, city: true },
        },
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
      expenses: number;
      cashflow: number;
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
        expenses: 0,
        cashflow: 0,
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
    let expenses = 0;
    let items = 0;
    let orderCount = 0;
    const productAgg = new Map<string, { id: string; name: string; sku: string; revenue: number; qty: number }>();
    const supplierAgg = new Map<string, { id: string; name: string; revenue: number; qty: number }>();
    const categoryAgg = new Map<string, { name: string; revenue: number; qty: number; cost: number }>();
    const geoAgg = new Map<string, { area: string; revenue: number; orders: number }>();
    const clientAgg = new Map<string, { id: string; name: string; revenue: number; orders: number; items: number }>();
    const selectedDaily = days.map((d) => ({
      date: d.date,
      revenue: 0,
      cost: 0,
      vat: 0,
      excise: 0,
      expenses: 0,
      cashflow: 0,
      orders: 0,
      items: 0,
      margin: 0,
    }));
    let selectedInfo: { id: string; sku: string; name: string } | null = null;
    let selectedRevenue = 0;
    let selectedCost = 0;
    let selectedVat = 0;
    let selectedExcise = 0;
    let selectedItems = 0;
    let selectedOrders = 0;

    const receiptLines = await prisma.goodsReceiptLine.findMany({
      where: {
        receipt: {
          receivedAt: {
            gte: start,
            lte: end,
          },
        },
      },
      include: {
        receipt: {
          select: {
            receivedAt: true,
          },
        },
      },
    });
    for (const line of receiptLines) {
      const key = line.receipt.receivedAt.toISOString().slice(0, 10);
      const idx = dayIndex.get(key);
      const lineExpense = Number(line.unitCost || 0) * Number(line.qty || 0);
      expenses += lineExpense;
      if (idx != null) {
        days[idx].expenses += lineExpense;
      }
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const idx = dayIndex.get(key);
      const orderRevenue = Number(order.total || 0);
      const orderItems = order.items.reduce((sum, i) => sum + i.qty, 0);
      const area =
        order.company?.province?.trim() ||
        order.company?.city?.trim() ||
        order.company?.name?.trim() ||
        "N/D";
      const geo = geoAgg.get(area) || { area, revenue: 0, orders: 0 };
      geo.revenue += orderRevenue;
      geo.orders += 1;
      geoAgg.set(area, geo);
      if (idx != null) {
        days[idx].orders += 1;
        days[idx].revenue += orderRevenue;
      }
      const clientId = order.companyId || order.company?.name || "N/D";
      const clientName = order.company?.name || "N/D";
      const clientRow = clientAgg.get(clientId) || {
        id: clientId,
        name: clientName,
        revenue: 0,
        orders: 0,
        items: 0,
      };
      clientRow.revenue += orderRevenue;
      clientRow.orders += 1;
      clientRow.items += orderItems;
      clientAgg.set(clientId, clientRow);
      orderCount += 1;
      revenue += orderRevenue;
      let orderHasSelected = false;
      for (const item of order.items) {
        const lineTotal = Number(item.lineTotal);
        const qty = item.qty;
        const product = item.product;
        const purchase = Number(product?.purchasePrice || 0);
        const rate = Number(product?.taxRate || product?.taxRateRef?.rate || 0);
        const exciseUnit = Number(
          product?.exciseTotal ?? (Number(product?.exciseMl || 0) + Number(product?.exciseProduct || 0))
        );
        const exciseAmount = exciseUnit * qty;
        const vatAmount = rate > 0 ? (lineTotal + exciseAmount) * (rate / 100) : 0;

        cost += purchase * qty;
        vat += vatAmount;
        excise += exciseAmount;
        items += qty;

        if (idx != null) {
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

        if (selectedProductId && product?.id === selectedProductId) {
          orderHasSelected = true;
          selectedInfo = {
            id: product.id,
            sku: product.sku,
            name: product.name,
          };
          selectedRevenue += lineTotal;
          selectedCost += purchase * qty;
          selectedVat += vatAmount;
          selectedExcise += exciseAmount;
          selectedItems += qty;
          if (idx != null) {
            selectedDaily[idx].revenue += lineTotal;
            selectedDaily[idx].cost += purchase * qty;
            selectedDaily[idx].vat += vatAmount;
            selectedDaily[idx].excise += exciseAmount;
            selectedDaily[idx].items += qty;
          }
        }
      }
      if (selectedProductId && orderHasSelected) {
        selectedOrders += 1;
        if (idx != null) selectedDaily[idx].orders += 1;
      }
    }

    for (const d of days) {
      d.margin = d.revenue - d.cost - d.vat - d.excise;
      d.cashflow = d.revenue - d.expenses;
    }
    for (const d of selectedDaily) {
      d.margin = d.revenue - d.cost - d.vat - d.excise;
      d.cashflow = d.revenue - d.expenses;
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
    const topGeo = Array.from(geoAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
    const topClients = Array.from(clientAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((c) => ({
        ...c,
        avgOrderValue: c.orders ? c.revenue / c.orders : 0,
      }));

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
        expenses,
        cashflow: revenue - expenses,
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
      topGeo,
      topClients,
      productInsights: selectedProductId
        ? {
            product: selectedInfo,
            totals: {
              revenue: selectedRevenue,
              cost: selectedCost,
              vat: selectedVat,
              excise: selectedExcise,
              margin: selectedRevenue - selectedCost - selectedVat - selectedExcise,
              items: selectedItems,
              orders: selectedOrders,
            },
            daily: selectedDaily,
          }
        : null,
    };
  });

  app.get("/analytics/export", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
      "Excise",
      "VAT",
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
          Number(r.excise || 0).toFixed(2),
          Number(r.vat || 0).toFixed(2),
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
      Number(r.excise || 0).toFixed(2),
      Number(r.vat || 0).toFixed(2),
      Number(r.margin || 0).toFixed(2),
    ]))]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="analytics_${start}_${end}.csv"`);
    return reply.send(csv);
  });

  app.get("/reports", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;

    const query = request.query as {
      start?: string;
      end?: string;
      companyId?: string;
      productId?: string;
      page?: string;
      perPage?: string;
    };

    const now = new Date();
    const end = query.end ? new Date(`${query.end}T23:59:59.999Z`) : now;
    const start = query.start ? new Date(`${query.start}T00:00:00.000Z`) : new Date(end);
    if (!query.start) start.setDate(end.getDate() - 29);
    const companyId = String(query.companyId || "").trim();
    const productId = String(query.productId || "").trim();
    const page = Math.max(1, Number(query.page || 1));
    const perPage = Math.min(500, Math.max(1, Number(query.perPage || 150)));
    const revenueStatuses: OrderStatus[] = ["APPROVED", "FULFILLED"];

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: { in: revenueStatuses },
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            product: {
              include: { taxRateRef: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const lines: Array<{
      id: string;
      createdAt: Date;
      orderId: string;
      orderNumber: number | null;
      companyId: string | null;
      companyName: string;
      productId: string;
      sku: string;
      productName: string;
      qty: number;
      unitPrice: number;
      lineNet: number;
      vat: number;
      excise: number;
      lineGross: number;
      cost: number;
      margin: number;
    }> = [];
    const ordersSet = new Set<string>();

    for (const order of orders) {
      for (const item of order.items) {
        if (productId && item.productId !== productId) continue;
        const lineNet = Number(item.lineTotal || 0);
        const qty = Number(item.qty || 0);
        const purchase = Number(item.product?.purchasePrice || 0);
        const rate = Number(item.product?.taxRate || item.product?.taxRateRef?.rate || 0);
        const exciseUnit = Number(
          item.product?.exciseTotal ??
          (Number(item.product?.exciseMl || 0) + Number(item.product?.exciseProduct || 0))
        );
        const excise = exciseUnit * qty;
        const vat = rate > 0 ? (lineNet + excise) * (rate / 100) : 0;
        const lineGross = lineNet + vat + excise;
        const cost = purchase * qty;
        const margin = lineNet - cost;

        lines.push({
          id: item.id,
          createdAt: order.createdAt,
          orderId: order.id,
          orderNumber: order.orderNumber ?? null,
          companyId: order.company?.id || null,
          companyName: order.company?.name || "N/D",
          productId: item.productId,
          sku: item.sku,
          productName: item.name,
          qty,
          unitPrice: Number(item.unitPrice || 0),
          lineNet,
          vat,
          excise,
          lineGross,
          cost,
          margin,
        });
        ordersSet.add(order.id);
      }
    }

    const totals = lines.reduce(
      (acc, l) => {
        acc.rows += 1;
        acc.qty += l.qty;
        acc.revenueNet += l.lineNet;
        acc.vat += l.vat;
        acc.excise += l.excise;
        acc.revenueGross += l.lineGross;
        acc.cost += l.cost;
        acc.margin += l.margin;
        return acc;
      },
      {
        rows: 0,
        orders: ordersSet.size,
        qty: 0,
        revenueNet: 0,
        revenueGross: 0,
        vat: 0,
        excise: 0,
        cost: 0,
        margin: 0,
      }
    );

    const topProductMap = new Map<string, { id: string; sku: string; name: string; qty: number; revenueGross: number }>();
    const topClientMap = new Map<string, { id: string; name: string; orders: number; revenueGross: number }>();
    const clientOrderMap = new Map<string, Set<string>>();

    for (const l of lines) {
      const p = topProductMap.get(l.productId) || {
        id: l.productId,
        sku: l.sku,
        name: l.productName,
        qty: 0,
        revenueGross: 0,
      };
      p.qty += l.qty;
      p.revenueGross += l.lineGross;
      topProductMap.set(l.productId, p);

      const key = l.companyId || l.companyName;
      const c = topClientMap.get(key) || {
        id: key,
        name: l.companyName,
        orders: 0,
        revenueGross: 0,
      };
      c.revenueGross += l.lineGross;
      topClientMap.set(key, c);
      const orderSet = clientOrderMap.get(key) || new Set<string>();
      orderSet.add(l.orderId);
      clientOrderMap.set(key, orderSet);
    }

    for (const [k, orderSet] of clientOrderMap.entries()) {
      const c = topClientMap.get(k);
      if (c) c.orders = orderSet.size;
    }

    const topProducts = Array.from(topProductMap.values())
      .sort((a, b) => b.revenueGross - a.revenueGross)
      .slice(0, 15);
    const topClients = Array.from(topClientMap.values())
      .sort((a, b) => b.revenueGross - a.revenueGross)
      .slice(0, 15);

    const total = lines.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * perPage;
    const paged = lines.slice(startIndex, startIndex + perPage);

    return {
      filters: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        companyId: companyId || null,
        productId: productId || null,
      },
      totals,
      topProducts,
      topClients,
      lines: paged,
      pagination: {
        page: safePage,
        perPage,
        total,
        totalPages,
      },
    };
  });

  app.get("/reports/export", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string; companyId?: string; productId?: string };

    const params = new URLSearchParams({
      start: query.start || "",
      end: query.end || "",
      page: "1",
      perPage: "500",
    });
    if (query.companyId) params.set("companyId", query.companyId);
    if (query.productId) params.set("productId", query.productId);

    const report = await (async () => {
      const res = await (app as any).inject({
        method: "GET",
        url: `/admin/reports?${params.toString()}`,
        headers: { authorization: request.headers.authorization || "" },
      });
      return JSON.parse(res.payload);
    })();

    const rows = report.lines || [];
    const header = [
      "Data",
      "Ordine",
      "Cliente",
      "SKU",
      "Prodotto",
      "Quantita",
      "PrezzoUnitario",
      "Imponibile",
      "Accisa",
      "IVA",
      "TotaleLordo",
    ];
    const csvEscape = (v: any) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/\"/g, "\"\"")}"`;
      }
      return s;
    };
    const csv = [
      header.join(","),
      ...rows.map((r: any) =>
        [
          new Date(r.createdAt).toISOString().slice(0, 10),
          r.orderNumber || r.orderId,
          r.companyName,
          r.sku,
          r.productName,
          r.qty,
          Number(r.unitPrice || 0).toFixed(2),
          Number(r.lineNet || 0).toFixed(2),
          Number(r.excise || 0).toFixed(2),
          Number(r.vat || 0).toFixed(2),
          Number(r.lineGross || 0).toFixed(2),
        ]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="report_vendite_${query.start || "from"}_${query.end || "to"}.csv"`
    );
    return reply.send(csv);
  });

  app.get("/settings", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    let settings = await prisma.appSetting.findFirst();
    if (!settings) {
      settings = await prisma.appSetting.create({ data: {} });
    }
    return settings;
  });

  app.get("/brands", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;

    const [saved, products, supplierProducts, inventoryItems] = await Promise.all([
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
      prisma.product.findMany({
        where: { brand: { not: null } },
        distinct: ["brand"],
        select: { brand: true },
      }),
      prisma.supplierProduct.findMany({
        where: { brand: { not: null } },
        distinct: ["brand"],
        select: { brand: true },
      }),
      prisma.internalInventoryItem.findMany({
        where: { brand: { not: null } },
        distinct: ["brand"],
        select: { brand: true },
      }),
    ]);

    const names = new Set<string>();
    for (const item of saved) names.add(String(item.name || "").trim());
    for (const item of products) if (item.brand) names.add(String(item.brand).trim());
    for (const item of supplierProducts) if (item.brand) names.add(String(item.brand).trim());
    for (const item of inventoryItems) if (item.brand) names.add(String(item.brand).trim());

    const countAgg = await prisma.product.groupBy({
      by: ["brand"],
      where: { brand: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map(
      countAgg.map((r) => [String(r.brand || "").trim(), r._count?._all || 0])
    );

    return Array.from(names)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }))
      .map((name) => ({ name, productsCount: countMap.get(name) || 0 }));
  });

  app.post("/brands", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    const name = body.name.trim();
    if (!name) return reply.badRequest("Nome brand obbligatorio");
    try {
      await prisma.brand.create({ data: { name } });
      return { ok: true };
    } catch (err: any) {
      if (err?.code === "P2002") return { ok: true };
      throw err;
    }
  });

  app.patch("/brands/:name", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const oldName = decodeURIComponent((request.params as any).name || "").trim();
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    const nextName = body.name.trim();
    if (!oldName || !nextName) return reply.badRequest("Nome brand non valido");

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { brand: oldName }, data: { brand: nextName } });
      await tx.supplierProduct.updateMany({ where: { brand: oldName }, data: { brand: nextName } });
      await tx.internalInventoryItem.updateMany({ where: { brand: oldName }, data: { brand: nextName } });
      await tx.brand.upsert({
        where: { name: nextName },
        update: {},
        create: { name: nextName },
      });
      try {
        await tx.brand.delete({ where: { name: oldName } });
      } catch {
        // ignored when old name does not exist in registry table
      }
    });

    return { ok: true };
  });

  app.delete("/brands/:name", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const name = decodeURIComponent((request.params as any).name || "").trim();
    if (!name) return reply.badRequest("Nome brand non valido");

    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { brand: name }, data: { brand: null } });
      await tx.supplierProduct.updateMany({ where: { brand: name }, data: { brand: null } });
      await tx.internalInventoryItem.updateMany({ where: { brand: name }, data: { brand: null } });
      try {
        await tx.brand.delete({ where: { name } });
      } catch {
        // ignored when row is missing from registry table
      }
    });

    return { ok: true };
  });

  app.get("/taxes", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.taxRate.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/taxes", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.taxRate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/excises", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.exciseRate.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/excises", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.discount.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/discounts", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        code: z.string().min(2).optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).default("ORDER"),
        target: z.string().optional(),
        type: z
          .enum(["PERCENT", "FIXED", "percent", "fixed"])
          .default("PERCENT")
          .transform((v) => v.toUpperCase() as "PERCENT" | "FIXED"),
        value: z.number().nonnegative(),
        minSpend: z.number().nonnegative().optional(),
        active: z.boolean().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(request.body);
    return prisma.discount.create({
      data: {
        name: body.name,
        code: body.code ? body.code.trim().toUpperCase() : null,
        scope: body.scope,
        target: body.target,
        type: body.type,
        value: new Prisma.Decimal(body.value),
        minSpend: body.minSpend != null ? new Prisma.Decimal(body.minSpend) : null,
        active: body.active ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes,
      },
    });
  });

  app.patch("/discounts/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        code: z.string().min(2).nullable().optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).optional(),
        target: z.string().optional(),
        type: z
          .enum(["PERCENT", "FIXED", "percent", "fixed"])
          .optional()
          .transform((v) => (v ? (v.toUpperCase() as "PERCENT" | "FIXED") : undefined)),
        value: z.number().nonnegative().optional(),
        minSpend: z.number().nonnegative().nullable().optional(),
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
        ...(body.code !== undefined
          ? { code: body.code ? body.code.trim().toUpperCase() : null }
          : {}),
        ...(body.scope ? { scope: body.scope } : {}),
        ...(body.target !== undefined ? { target: body.target } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.value !== undefined ? { value: new Prisma.Decimal(body.value) } : {}),
        ...(body.minSpend !== undefined
          ? { minSpend: body.minSpend != null ? new Prisma.Decimal(body.minSpend) : null }
          : {}),
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.discount.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/rules", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return prisma.discountRule.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post("/rules", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        active: z.boolean().optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).default("ORDER"),
        target: z.string().optional(),
        type: z
          .enum(["PERCENT", "FIXED", "percent", "fixed"])
          .default("PERCENT")
          .transform((v) => v.toUpperCase() as "PERCENT" | "FIXED"),
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        active: z.boolean().optional(),
        scope: z.enum(["ORDER", "PRODUCT", "CATEGORY", "BRAND", "SUPPLIER", "PARENT"]).optional(),
        target: z.string().optional(),
        type: z
          .enum(["PERCENT", "FIXED", "percent", "fixed"])
          .optional()
          .transform((v) => (v ? (v.toUpperCase() as "PERCENT" | "FIXED") : undefined)),
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.discountRule.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.delete("/excises/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.exciseRate.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.patch("/settings", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.product.findMany({
        select: {
          category: true,
          categoryId: true,
          categoryIds: true,
          subcategory: true,
          subcategories: true,
        },
      }),
    ]);
    const normalizeCategoryToken = (value?: string | null) =>
      (value || "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    const categoryIdsByName = new Map<string, string[]>();
    for (const c of categories) {
      const key = normalizeCategoryToken(c.name);
      if (!key) continue;
      const list = categoryIdsByName.get(key) || [];
      list.push(c.id);
      categoryIdsByName.set(key, list);
    }
    const countMap = new Map<string, number>();
    const addByName = (ids: Set<string>, raw?: string | null) => {
      if (!raw) return;
      const parts = String(raw)
        .split(/[|;,]/g)
        .map((x) => normalizeCategoryToken(x))
        .filter(Boolean);
      for (const key of parts) {
        const matches = categoryIdsByName.get(key) || [];
        for (const id of matches) ids.add(id);
      }
    };
    for (const p of products) {
      const ids = new Set<string>();
      if (p.categoryId) ids.add(p.categoryId);
      if (Array.isArray(p.categoryIds)) {
        for (const id of p.categoryIds) {
          if (typeof id === "string" && id) ids.add(id);
        }
      }
      addByName(ids, p.category);
      addByName(ids, p.subcategory);
      if (Array.isArray(p.subcategories)) {
        for (const sub of p.subcategories) {
          if (typeof sub === "string") addByName(ids, sub);
        }
      }
      for (const id of ids) {
        countMap.set(id, (countMap.get(id) || 0) + 1);
      }
    }
    return categories.map((c) => ({
      ...c,
      _count: { products: countMap.get(c.id) || 0 },
      productsCount: countMap.get(c.id) || 0,
    }));
  });

  app.post("/categories", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        parentId: z.string().optional(),
        description: z.string().optional(),
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
        description: body.description || null,
      },
    });
  });

  app.patch("/categories/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        parentId: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(request.body);
    const data: any = {};
    if (body.name) {
      data.name = body.name;
      data.slug = slugify(body.name);
    }
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    return prisma.category.update({ where: { id }, data });
  });

  app.patch("/categories/reorder", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z.object({ ids: z.array(z.string()).min(1) }).parse(request.body);
    await prisma.$transaction(
      body.ids.map((id, index) =>
        prisma.category.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    return { ok: true };
  });

  app.delete("/categories/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const children = await prisma.category.count({ where: { parentId: id } });
    if (children > 0) return reply.conflict("Remove children first");
    await prisma.category.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/suppliers/:id/products", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const limitParam = (request.query as any)?.limit as string | undefined;
    const pageParam = (request.query as any)?.page as string | undefined;
    const perPageParam = (request.query as any)?.perPage as string | undefined;
    const q = ((request.query as any)?.q as string | undefined)?.trim();
    const importFilter = ((request.query as any)?.importFilter as string | undefined) || "all";
    const limit = Math.min(Number(limitParam || 200), 500);
    const perPage = Math.min(Number(perPageParam || 20), 200);
    const page = Math.max(Number(pageParam || 1), 1);
    const skip = (page - 1) * perPage;

    const importedBySupplier = await prisma.product.findMany({
      where: { sourceSupplierId: supplierId, source: "SUPPLIER" },
      select: { sku: true },
    });
    const importedSkus = importedBySupplier.map((p) => p.sku);

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
      ...(importFilter === "imported"
        ? importedSkus.length
          ? { supplierSku: { in: importedSkus } }
          : { supplierSku: { in: ["__none__"] } }
        : {}),
      ...(importFilter === "to-import"
        ? importedSkus.length
          ? { supplierSku: { notIn: importedSkus } }
          : {}
        : {}),
    } as any;

    const [supplierProducts, total] = await Promise.all([
      prisma.supplierProduct.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { lastSeenAt: "desc" }],
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        name: z.string().min(2),
        code: z.string().min(2),
        legalName: z.string().optional(),
        vatNumber: z.string().optional(),
        taxCode: z.string().optional(),
        sdiCode: z.string().optional(),
        pec: z.string().optional(),
        address: z.string().optional(),
        cap: z.string().optional(),
        city: z.string().optional(),
        province: z.string().optional(),
        country: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        isPrimary: z.boolean().optional(),
        csvFullUrl: z.string().url().optional(),
        csvStockUrl: z.string().url().optional(),
        fieldMap: z.record(z.string()).optional(),
      })
      .parse(request.body);

    return prisma.supplier.create({
      data: {
        ...body,
        legalName: body.legalName || null,
        vatNumber: body.vatNumber || null,
        taxCode: body.taxCode || null,
        sdiCode: body.sdiCode || null,
        pec: body.pec || null,
        address: body.address || null,
        cap: body.cap || null,
        city: body.city || null,
        province: body.province || null,
        country: body.country || null,
        phone: body.phone || null,
        email: body.email || null,
      },
    });
  });

  app.post("/suppliers/:id/import-full", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const body = z
      .object({
        name: z.string().min(2).optional(),
        legalName: z.string().nullable().optional(),
        vatNumber: z.string().nullable().optional(),
        taxCode: z.string().nullable().optional(),
        sdiCode: z.string().nullable().optional(),
        pec: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        cap: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        province: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
      })
      .parse(request.body);
    return prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.legalName !== undefined ? { legalName: body.legalName || null } : {}),
        ...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber || null } : {}),
        ...(body.taxCode !== undefined ? { taxCode: body.taxCode || null } : {}),
        ...(body.sdiCode !== undefined ? { sdiCode: body.sdiCode || null } : {}),
        ...(body.pec !== undefined ? { pec: body.pec || null } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
        ...(body.cap !== undefined ? { cap: body.cap || null } : {}),
        ...(body.city !== undefined ? { city: body.city || null } : {}),
        ...(body.province !== undefined ? { province: body.province || null } : {}),
        ...(body.country !== undefined ? { country: body.country || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
      },
    });
  });

  app.delete("/suppliers/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const linkedProducts = await prisma.product.count({
      where: { sourceSupplierId: supplierId },
    });
    const linkedSupplierProducts = await prisma.supplierProduct.count({
      where: { supplierId },
    });
    const linkedReceipts = await prisma.goodsReceipt.count({
      where: { supplierId },
    });
    if (linkedProducts > 0 || linkedSupplierProducts > 0 || linkedReceipts > 0) {
      return reply
        .code(409)
        .send({ error: "Fornitore collegato a prodotti/import/carichi: rimuovi prima i collegamenti" });
    }
    await prisma.supplier.delete({ where: { id: supplierId } });
    return reply.code(204).send();
  });

  app.post("/suppliers/:id/update-stock", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const supplierId = (request.params as any).id as string;
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.csvStockUrl) throw app.httpErrors.notFound("Supplier or URL missing");

    const result = await importStockFromSupplier(supplier);
    return result;
  });

  app.post("/suppliers/:id/promote", async (request, reply) => {
    const user = await requireAdmin(request, reply);
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

  app.get("/inventory/items", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const q = String((request.query as any)?.q || "").trim();
    const asOf = String((request.query as any)?.asOf || "").trim();
    const asOfDate = asOf ? new Date(`${asOf}T23:59:59.999Z`) : null;
    const limitRaw = Number((request.query as any)?.limit || 400);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 400));
    return prisma.internalInventoryItem.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(asOfDate ? { updatedAt: { lte: asOfDate } } : {}),
      },
      include: {
        taxRateRef: true,
        exciseRateRef: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  });

  app.get("/inventory/export", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const q = String((request.query as any)?.q || "").trim();
    const rows = await prisma.internalInventoryItem.findMany({
      where: q
        ? {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { exciseRateRef: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    const header = [
      "SKU",
      "Nome",
      "Brand",
      "Categoria",
      "Sottocategoria",
      "CodicePL",
      "MLProdotto",
      "Giacenza",
      "Costo",
      "Prezzo",
      "Accisa",
    ];
    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Inventario">
  <Table>
   ${[header, ...rows.map((r) => [
      r.sku,
      r.name,
      r.brand || "",
      r.category || "",
      r.subcategory || "",
      "",
      Number(r.mlProduct || 0).toString(),
      Number(r.stockQty || 0).toString(),
      Number(r.purchasePrice || 0).toFixed(2),
      Number(r.price || 0).toFixed(2),
      r.exciseRateRef?.name || "",
    ])]
      .map(
        (row) =>
          `<Row>${row
            .map((c) => `<Cell><Data ss:Type="String">${String(c ?? "")}</Data></Cell>`)
            .join("")}</Row>`
      )
      .join("")}
  </Table>
 </Worksheet>
</Workbook>`;
    reply.header("Content-Type", "application/vnd.ms-excel");
    reply.header("Content-Disposition", 'attachment; filename="inventario.xls"');
    return reply.send(xml);
  });

  app.post("/inventory/items", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        sku: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        shortDescription: z.string().optional().nullable(),
        brand: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        subcategory: z.string().optional().nullable(),
        barcode: z.string().optional().nullable(),
        nicotine: z.number().optional().nullable(),
        mlProduct: z.number().optional().nullable(),
        purchasePrice: z.number().optional().nullable(),
        listPrice: z.number().optional().nullable(),
        price: z.number().optional().nullable(),
        stockQty: z.number().int().optional(),
        taxRateId: z.string().optional().nullable(),
        exciseRateId: z.string().optional().nullable(),
      })
      .parse(request.body);

    const created = await prisma.internalInventoryItem.create({
      data: {
        sku: body.sku.trim(),
        name: body.name.trim(),
        description: body.description || null,
        shortDescription: body.shortDescription || null,
        brand: body.brand || null,
        category: body.category || null,
        subcategory: body.subcategory || null,
        barcode: body.barcode || null,
        nicotine: body.nicotine ?? null,
        mlProduct: body.mlProduct ?? null,
        purchasePrice: body.purchasePrice ?? null,
        listPrice: body.listPrice ?? null,
        price: body.price ?? null,
        stockQty: body.stockQty ?? 0,
        taxRateId: body.taxRateId || null,
        exciseRateId: body.exciseRateId || null,
      },
      include: {
        taxRateRef: true,
        exciseRateRef: true,
      },
    });
    return reply.code(201).send(created);
  });

  app.patch("/inventory/items/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        sku: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        shortDescription: z.string().nullable().optional(),
        brand: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        subcategory: z.string().nullable().optional(),
        barcode: z.string().nullable().optional(),
        nicotine: z.number().nullable().optional(),
        mlProduct: z.number().nullable().optional(),
        purchasePrice: z.number().nullable().optional(),
        listPrice: z.number().nullable().optional(),
        price: z.number().nullable().optional(),
        stockQty: z.number().int().optional(),
        taxRateId: z.string().nullable().optional(),
        exciseRateId: z.string().nullable().optional(),
      })
      .parse(request.body);

    const updated = await prisma.internalInventoryItem.update({
      where: { id },
      data: {
        ...(body.sku !== undefined ? { sku: body.sku.trim() } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.shortDescription !== undefined
          ? { shortDescription: body.shortDescription || null }
          : {}),
        ...(body.brand !== undefined ? { brand: body.brand || null } : {}),
        ...(body.category !== undefined ? { category: body.category || null } : {}),
        ...(body.subcategory !== undefined ? { subcategory: body.subcategory || null } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode || null } : {}),
        ...(body.nicotine !== undefined ? { nicotine: body.nicotine } : {}),
        ...(body.mlProduct !== undefined ? { mlProduct: body.mlProduct } : {}),
        ...(body.purchasePrice !== undefined ? { purchasePrice: body.purchasePrice } : {}),
        ...(body.listPrice !== undefined ? { listPrice: body.listPrice } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.stockQty !== undefined ? { stockQty: body.stockQty } : {}),
        ...(body.taxRateId !== undefined ? { taxRateId: body.taxRateId || null } : {}),
        ...(body.exciseRateId !== undefined ? { exciseRateId: body.exciseRateId || null } : {}),
      },
      include: {
        taxRateRef: true,
        exciseRateRef: true,
      },
    });
    return updated;
  });

  app.patch("/inventory/quick-qty", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        changes: z
          .array(
            z.object({
              id: z.string().min(1),
              stockQty: z.number().int().min(0),
            })
          )
          .min(1),
      })
      .parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      for (const change of body.changes) {
        await tx.internalInventoryItem.update({
          where: { id: change.id },
          data: { stockQty: change.stockQty },
        });
        updated += 1;
      }
      return { updated };
    });
    return result;
  });

  app.get("/inventory/movements", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string };
    const start = query.start ? new Date(`${query.start}T00:00:00.000Z`) : null;
    const end = query.end ? new Date(`${query.end}T23:59:59.999Z`) : null;

    const [receiptLines, orders] = await Promise.all([
      prisma.goodsReceiptLine.findMany({
        where: {
          receipt: {
            receivedAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          },
        },
        include: {
          receipt: {
            select: {
              receivedAt: true,
              reference: true,
              supplierName: true,
              supplier: { select: { name: true } },
            },
          },
          item: {
            include: { exciseRateRef: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.order.findMany({
        where: {
          createdAt: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
          status: { in: ["APPROVED", "FULFILLED"] },
        },
        include: {
          company: { select: { name: true } },
          items: {
            include: {
              product: {
                include: { exciseRateRef: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
    ]);

    const movements: Array<any> = [];
    for (const line of receiptLines) {
      const excise = line.item?.exciseRateRef;
      movements.push({
        type: "CARICO",
        date: line.receipt.receivedAt,
        invoiceNo: line.receipt.reference || "",
        counterparty: line.receipt.supplier?.name || line.receipt.supplierName || "Fornitore",
        sku: line.sku,
        name: line.name,
        codicePl: "",
        mlProduct: Number(line.item?.mlProduct || 0),
        excise: excise ? `${excise.name}` : "",
        loadQty: Number(line.qty || 0),
        unloadQty: 0,
      });
    }

    for (const order of orders) {
      for (const line of order.items) {
        const excise = line.product?.exciseRateRef;
        movements.push({
          type: "SCARICO",
          date: order.createdAt,
          invoiceNo: String(order.orderNumber || ""),
          counterparty: order.company?.name || "Cliente",
          sku: line.sku,
          name: line.name,
          codicePl: line.product?.codicePl || "",
          mlProduct: Number(line.product?.mlProduct || 0),
          excise: excise ? `${excise.name}` : "",
          loadQty: 0,
          unloadQty: Number(line.qty || 0),
        });
      }
    }

    movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return movements.slice(0, 10000);
  });

  function parseReceiptNotes(raw: string | null | undefined) {
    const text = String(raw || "");
    const m = text.match(/\[INV_DATE:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
    const invoiceDate = m?.[1] || null;
    const plainNotes = text.replace(/\[INV_DATE:[0-9]{4}-[0-9]{2}-[0-9]{2}\]\s*/g, "").trim();
    return { invoiceDate, plainNotes };
  }

  function composeReceiptNotes(invoiceDate?: string | null, notes?: string | null) {
    const parts: string[] = [];
    const d = String(invoiceDate || "").trim();
    if (d) parts.push(`[INV_DATE:${d}]`);
    const n = String(notes || "").trim();
    if (n) parts.push(n);
    return parts.join("\n");
  }

  app.get("/goods-receipts", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = request.query as { start?: string; end?: string; supplierId?: string };
    const start = query.start ? new Date(`${query.start}T00:00:00.000Z`) : null;
    const end = query.end ? new Date(`${query.end}T23:59:59.999Z`) : null;
    const rows = await prisma.goodsReceipt.findMany({
      where: {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...((start || end)
          ? {
              receivedAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
      include: {
        lines: {
          select: {
            qty: true,
            unitCost: true,
            item: {
              select: {
                taxRateRef: { select: { rate: true } },
              },
            },
          },
        },
        createdBy: {
          select: { id: true, email: true },
        },
        supplier: {
          select: { id: true, name: true, legalName: true },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    });
    return rows.map((r, index) => {
      const parsed = parseReceiptNotes(r.notes);
      const totalNet = r.lines.reduce(
        (sum, line) => sum + Number(line.qty || 0) * Number(line.unitCost || 0),
        0
      );
      const totalVat = r.lines.reduce((sum, line) => {
        const rate = Number(line.item?.taxRateRef?.rate || 0);
        const lineNet = Number(line.qty || 0) * Number(line.unitCost || 0);
        return sum + lineNet * (rate / 100);
      }, 0);
      return {
        ...r,
        progressiveNo: rows.length - index,
        invoiceNo: r.reference || null,
        invoiceDate: parsed.invoiceDate,
        notes: parsed.plainNotes,
        linesCount: r.lines.length,
        totalQty: r.lines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
        totalNet,
        totalVat,
        totalGross: totalNet + totalVat,
      };
    });
  });

  app.get("/goods-receipts/sku-info", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const sku = String((request.query as any)?.sku || "").trim();
    if (!sku) return reply.badRequest("SKU obbligatorio");

    const [product, item, lastLine] = await Promise.all([
      prisma.product.findUnique({
        where: { sku },
        select: {
          id: true,
          sku: true,
          name: true,
          shortDescription: true,
          description: true,
          brand: true,
          category: true,
          subcategory: true,
          categoryIds: true,
          subcategories: true,
          barcode: true,
          nicotine: true,
          mlProduct: true,
          codicePl: true,
          imageUrl: true,
          imageUrls: true,
          taxRateId: true,
          exciseRateId: true,
          purchasePrice: true,
          listPrice: true,
          price: true,
        },
      }),
      prisma.internalInventoryItem.findUnique({
        where: { sku },
        select: {
          id: true,
          sku: true,
          name: true,
          shortDescription: true,
          description: true,
          brand: true,
          category: true,
          subcategory: true,
          barcode: true,
          nicotine: true,
          mlProduct: true,
          taxRateId: true,
          exciseRateId: true,
          purchasePrice: true,
          listPrice: true,
          price: true,
        },
      }),
      prisma.goodsReceiptLine.findFirst({
        where: { sku },
        select: {
          unitCost: true,
          unitPrice: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!product && !item && !lastLine) return { found: false };

    return {
      found: true,
      sku,
      product: product || null,
      inventory: item || null,
      last: {
        unitCost: lastLine?.unitCost ?? null,
        unitPrice: lastLine?.unitPrice ?? null,
        at: lastLine?.createdAt ?? null,
      },
    };
  });

  app.get("/goods-receipts/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const row = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            item: true,
          },
          orderBy: { createdAt: "asc" },
        },
        createdBy: {
          select: { id: true, email: true },
        },
        supplier: true,
      },
    });
    if (!row) return reply.notFound("Carico non trovato");
    const parsed = parseReceiptNotes(row.notes);
    return {
      ...row,
      invoiceNo: row.reference || null,
      invoiceDate: parsed.invoiceDate,
      notes: parsed.plainNotes,
    };
  });

  app.post("/goods-receipts", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = z
      .object({
        supplierId: z.string().optional().nullable(),
        supplierName: z.string().optional().nullable(),
        invoiceNo: z.string().optional().nullable(),
        invoiceDate: z.string().optional().nullable(),
        reference: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        receivedAt: z.string().optional().nullable(),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1),
              name: z.string().optional().nullable(),
              qty: z.number().int().positive(),
              unitCost: z.number().optional().nullable(),
              unitPrice: z.number().optional().nullable(),
              description: z.string().optional().nullable(),
              shortDescription: z.string().optional().nullable(),
              brand: z.string().optional().nullable(),
              category: z.string().optional().nullable(),
              subcategory: z.string().optional().nullable(),
              barcode: z.string().optional().nullable(),
              nicotine: z.number().optional().nullable(),
              mlProduct: z.number().optional().nullable(),
              taxRateId: z.string().optional().nullable(),
              exciseRateId: z.string().optional().nullable(),
              lineNote: z.string().optional().nullable(),
            })
          )
          .min(1),
      })
      .parse(request.body);

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cleanRef = String(body.invoiceNo || body.reference || "").trim();
    const baseReceiptNo =
      cleanRef.length > 0
        ? `FATT-${cleanRef}`
        : `CAR-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const result = await prisma.$transaction(async (tx) => {
      let receiptNo = baseReceiptNo;
      let suffix = 2;
      while (await tx.goodsReceipt.findUnique({ where: { receiptNo } })) {
        receiptNo = `${baseReceiptNo}-${suffix}`;
        suffix += 1;
      }
      const supplier = body.supplierId
        ? await tx.supplier.findUnique({ where: { id: body.supplierId } })
        : null;
      const receipt = await tx.goodsReceipt.create({
        data: {
          receiptNo,
          supplierId: body.supplierId || null,
          supplierName: body.supplierName || supplier?.name || null,
          reference: body.invoiceNo || body.reference || null,
          notes: composeReceiptNotes(body.invoiceDate || null, body.notes || null) || null,
          receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
          createdById: user.id || null,
        },
      });

      let createdItems = 0;
      let updatedItems = 0;
      let totalQty = 0;

      for (const rawLine of body.lines) {
        const sku = rawLine.sku.trim();
        const name = (rawLine.name || sku).trim();
        const qty = Number(rawLine.qty || 0);
        totalQty += qty;

        const [existing, product] = await Promise.all([
          tx.internalInventoryItem.findUnique({ where: { sku } }),
          tx.product.findUnique({
            where: { sku },
            select: {
              name: true,
              description: true,
              shortDescription: true,
              brand: true,
              category: true,
              subcategory: true,
              barcode: true,
              nicotine: true,
              mlProduct: true,
              taxRateId: true,
              exciseRateId: true,
              purchasePrice: true,
              price: true,
            },
          }),
        ]);
        const pickVal = (...vals: any[]) => {
          for (const v of vals) {
            if (v !== undefined && v !== null && String(v).trim() !== "") return v;
          }
          return null;
        };

        const nextData: Prisma.InternalInventoryItemUncheckedUpdateInput = {
          stockQty: { increment: qty },
          name: String(pickVal(rawLine.name, existing?.name, product?.name, sku) || sku),
          description: pickVal(rawLine.description, existing?.description, product?.description),
          shortDescription: pickVal(
            rawLine.shortDescription,
            existing?.shortDescription,
            product?.shortDescription
          ),
          brand: pickVal(rawLine.brand, existing?.brand, product?.brand),
          category: pickVal(rawLine.category, existing?.category, product?.category),
          subcategory: pickVal(rawLine.subcategory, existing?.subcategory, product?.subcategory),
          barcode: pickVal(rawLine.barcode, existing?.barcode, product?.barcode),
          nicotine: rawLine.nicotine ?? existing?.nicotine ?? product?.nicotine ?? null,
          mlProduct: rawLine.mlProduct ?? existing?.mlProduct ?? product?.mlProduct ?? null,
          purchasePrice:
            rawLine.unitCost ?? existing?.purchasePrice ?? product?.purchasePrice ?? null,
          price: rawLine.unitPrice ?? existing?.price ?? product?.price ?? null,
          taxRateId: pickVal(rawLine.taxRateId, existing?.taxRateId, product?.taxRateId),
          exciseRateId: pickVal(
            rawLine.exciseRateId,
            existing?.exciseRateId,
            product?.exciseRateId
          ),
        };

        const item = existing
          ? await tx.internalInventoryItem.update({
              where: { id: existing.id },
              data: nextData,
            })
          : await tx.internalInventoryItem.create({
              data: {
                sku,
                name: String(pickVal(rawLine.name, product?.name, sku) || sku),
                description: pickVal(rawLine.description, product?.description),
                shortDescription: pickVal(rawLine.shortDescription, product?.shortDescription),
                brand: pickVal(rawLine.brand, product?.brand),
                category: pickVal(rawLine.category, product?.category),
                subcategory: pickVal(rawLine.subcategory, product?.subcategory),
                barcode: pickVal(rawLine.barcode, product?.barcode),
                nicotine: rawLine.nicotine ?? product?.nicotine ?? null,
                mlProduct: rawLine.mlProduct ?? product?.mlProduct ?? null,
                purchasePrice: rawLine.unitCost ?? product?.purchasePrice ?? null,
                price: rawLine.unitPrice ?? product?.price ?? null,
                stockQty: qty,
                taxRateId: pickVal(rawLine.taxRateId, product?.taxRateId),
                exciseRateId: pickVal(rawLine.exciseRateId, product?.exciseRateId),
              },
            });

        if (existing) updatedItems += 1;
        else createdItems += 1;

        await tx.goodsReceiptLine.create({
          data: {
            receiptId: receipt.id,
            itemId: item.id,
            sku,
            name,
            qty,
            unitCost: rawLine.unitCost ?? null,
            unitPrice: rawLine.unitPrice ?? null,
            lineNote: rawLine.lineNote || null,
          },
        });
      }

      return {
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        createdItems,
        updatedItems,
        totalLines: body.lines.length,
        totalQty,
      };
    });

    return reply.code(201).send(result);
  });

  app.patch("/goods-receipts/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const body = z
      .object({
        supplierId: z.string().optional().nullable(),
        supplierName: z.string().optional().nullable(),
        invoiceNo: z.string().optional().nullable(),
        invoiceDate: z.string().optional().nullable(),
        reference: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        receivedAt: z.string().optional().nullable(),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1),
              name: z.string().optional().nullable(),
              qty: z.number().int().positive(),
              unitCost: z.number().optional().nullable(),
              unitPrice: z.number().optional().nullable(),
              description: z.string().optional().nullable(),
              shortDescription: z.string().optional().nullable(),
              brand: z.string().optional().nullable(),
              category: z.string().optional().nullable(),
              subcategory: z.string().optional().nullable(),
              barcode: z.string().optional().nullable(),
              nicotine: z.number().optional().nullable(),
              mlProduct: z.number().optional().nullable(),
              taxRateId: z.string().optional().nullable(),
              exciseRateId: z.string().optional().nullable(),
              lineNote: z.string().optional().nullable(),
            })
          )
          .min(1),
      })
      .parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      const supplier = body.supplierId
        ? await tx.supplier.findUnique({ where: { id: body.supplierId } })
        : null;
      const existing = await tx.goodsReceipt.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!existing) throw app.httpErrors.notFound("Carico non trovato");

      const oldQtyByItem = new Map<string, number>();
      for (const line of existing.lines) {
        oldQtyByItem.set(line.itemId, (oldQtyByItem.get(line.itemId) || 0) + Number(line.qty || 0));
      }

      const resolvedLines: Array<{
        itemId: string;
        sku: string;
        name: string;
        qty: number;
        unitCost: number | null;
        unitPrice: number | null;
        lineNote: string | null;
      }> = [];

      for (const rawLine of body.lines) {
        const sku = rawLine.sku.trim();
        const name = (rawLine.name || sku).trim();
        const [current, product] = await Promise.all([
          tx.internalInventoryItem.findUnique({ where: { sku } }),
          tx.product.findUnique({
            where: { sku },
            select: {
              name: true,
              description: true,
              shortDescription: true,
              brand: true,
              category: true,
              subcategory: true,
              barcode: true,
              nicotine: true,
              mlProduct: true,
              taxRateId: true,
              exciseRateId: true,
              purchasePrice: true,
              price: true,
            },
          }),
        ]);
        const pickVal = (...vals: any[]) => {
          for (const v of vals) {
            if (v !== undefined && v !== null && String(v).trim() !== "") return v;
          }
          return null;
        };
        let item = current;
        const itemName = String(pickVal(rawLine.name, current?.name, product?.name, sku) || sku);
        if (!item) {
          item = await tx.internalInventoryItem.create({
            data: {
              sku,
              name: itemName,
              description: pickVal(rawLine.description, product?.description),
              shortDescription: pickVal(rawLine.shortDescription, product?.shortDescription),
              brand: pickVal(rawLine.brand, product?.brand),
              category: pickVal(rawLine.category, product?.category),
              subcategory: pickVal(rawLine.subcategory, product?.subcategory),
              barcode: pickVal(rawLine.barcode, product?.barcode),
              nicotine: rawLine.nicotine ?? product?.nicotine ?? null,
              mlProduct: rawLine.mlProduct ?? product?.mlProduct ?? null,
              purchasePrice: rawLine.unitCost ?? product?.purchasePrice ?? null,
              price: rawLine.unitPrice ?? product?.price ?? null,
              stockQty: 0,
              taxRateId: pickVal(rawLine.taxRateId, product?.taxRateId),
              exciseRateId: pickVal(rawLine.exciseRateId, product?.exciseRateId),
            },
          });
        } else {
          await tx.internalInventoryItem.update({
            where: { id: item.id },
            data: {
              name: itemName,
              description: pickVal(rawLine.description, current?.description, product?.description),
              shortDescription: pickVal(
                rawLine.shortDescription,
                current?.shortDescription,
                product?.shortDescription
              ),
              brand: pickVal(rawLine.brand, current?.brand, product?.brand),
              category: pickVal(rawLine.category, current?.category, product?.category),
              subcategory: pickVal(rawLine.subcategory, current?.subcategory, product?.subcategory),
              barcode: pickVal(rawLine.barcode, current?.barcode, product?.barcode),
              nicotine: rawLine.nicotine ?? current?.nicotine ?? product?.nicotine ?? null,
              mlProduct: rawLine.mlProduct ?? current?.mlProduct ?? product?.mlProduct ?? null,
              purchasePrice:
                rawLine.unitCost ?? current?.purchasePrice ?? product?.purchasePrice ?? null,
              price: rawLine.unitPrice ?? current?.price ?? product?.price ?? null,
              taxRateId: pickVal(rawLine.taxRateId, current?.taxRateId, product?.taxRateId),
              exciseRateId: pickVal(
                rawLine.exciseRateId,
                current?.exciseRateId,
                product?.exciseRateId
              ),
            },
          });
        }

        resolvedLines.push({
          itemId: item.id,
          sku,
          name,
          qty: Number(rawLine.qty || 0),
          unitCost: rawLine.unitCost ?? null,
          unitPrice: rawLine.unitPrice ?? null,
          lineNote: rawLine.lineNote || null,
        });
      }

      const newQtyByItem = new Map<string, number>();
      for (const line of resolvedLines) {
        newQtyByItem.set(line.itemId, (newQtyByItem.get(line.itemId) || 0) + line.qty);
      }

      const allItemIds = new Set<string>([
        ...Array.from(oldQtyByItem.keys()),
        ...Array.from(newQtyByItem.keys()),
      ]);

      for (const itemId of allItemIds) {
        const oldQty = oldQtyByItem.get(itemId) || 0;
        const newQty = newQtyByItem.get(itemId) || 0;
        const delta = newQty - oldQty;
        if (delta === 0) continue;
        const item = await tx.internalInventoryItem.findUnique({ where: { id: itemId } });
        if (!item) continue;
        const nextQty = Math.max(0, Number(item.stockQty || 0) + delta);
        await tx.internalInventoryItem.update({
          where: { id: itemId },
          data: { stockQty: nextQty },
        });
      }

      await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
      await tx.goodsReceiptLine.createMany({
        data: resolvedLines.map((line) => ({
          receiptId: id,
          itemId: line.itemId,
          sku: line.sku,
          name: line.name,
          qty: line.qty,
          unitCost: line.unitCost,
          unitPrice: line.unitPrice,
          lineNote: line.lineNote,
        })),
      });

      await tx.goodsReceipt.update({
        where: { id },
        data: {
          supplierId: body.supplierId || null,
          supplierName: body.supplierName || supplier?.name || null,
          reference: body.invoiceNo || body.reference || null,
          notes: composeReceiptNotes(body.invoiceDate || null, body.notes || null) || null,
          receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
        },
      });

      return {
        receiptId: id,
        updatedLines: resolvedLines.length,
      };
    });

    return result;
  });

  app.delete("/goods-receipts/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;

    const receipt = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!receipt) return reply.notFound("Arrivo merci non trovato");

    const result = await prisma.$transaction(async (tx) => {
      const qtyByItem = new Map<string, number>();
      for (const line of receipt.lines) {
        qtyByItem.set(line.itemId, (qtyByItem.get(line.itemId) || 0) + Number(line.qty || 0));
      }

      // Delete receipt first so its lines are removed (ON DELETE CASCADE),
      // then we can safely evaluate if inventory items can be removed.
      await tx.goodsReceipt.delete({ where: { id } });

      let deletedItems = 0;
      let updatedItems = 0;

      for (const [itemId, qtyToRevert] of qtyByItem.entries()) {
        const item = await tx.internalInventoryItem.findUnique({ where: { id: itemId } });
        if (!item) continue;
        const nextQty = Number(item.stockQty || 0) - qtyToRevert;
        const remainingLines = await tx.goodsReceiptLine.count({ where: { itemId } });

        if (nextQty <= 0 && remainingLines === 0) {
          await tx.internalInventoryItem.delete({ where: { id: itemId } });
          deletedItems += 1;
        } else {
          await tx.internalInventoryItem.update({
            where: { id: itemId },
            data: { stockQty: Math.max(0, nextQty) },
          });
          updatedItems += 1;
        }
      }

      return {
        deletedReceipt: id,
        revertedLines: receipt.lines.length,
        updatedItems,
        deletedItems,
      };
    });

    return result;
  });

  app.get("/returns", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const status = String((request.query as any)?.status || "ALL");
    const rows = await prisma.returnRequest.findMany({
      where: status === "ALL" ? undefined : { status: status as any },
      include: {
        company: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
        images: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });
    return rows.map((r) => ({
      ...r,
      customerName:
        r.company?.name ||
        r.contactName ||
        r.user?.email ||
        "Cliente demo area privata",
    }));
  });

  app.get("/returns/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const row = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        company: true,
        user: true,
        handledBy: { select: { id: true, email: true } },
        images: true,
      },
    });
    if (!row) return reply.notFound("Reso non trovato");
    return {
      ...row,
      customerName:
        row.company?.name ||
        row.contactName ||
        row.user?.email ||
        "Cliente demo area privata",
    };
  });

  app.patch("/returns/:id/handle", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: "HANDLED",
        handledAt: new Date(),
        handledById: user.id || null,
      },
    });
    return updated;
  });

  app.delete("/returns/:id", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const id = (request.params as any).id as string;
    await prisma.returnRequest.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get("/notifications", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;

    const [returns, orders, companies, pendingUsers] = await Promise.all([
      prisma.returnRequest.findMany({
        where: { status: "PENDING" },
        include: {
          company: { select: { name: true } },
          user: { select: { email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.order.findMany({
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.company.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.user.findMany({
        where: { approved: false },
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const items = [
      ...returns.map((r) => ({
        id: `return:${r.id}`,
        type: "RETURN_REQUEST",
        createdAt: r.createdAt,
        title: "Nuova richiesta reso",
        message: `${r.company?.name || r.user?.email || r.contactName || "Cliente"} · Ordine ${r.orderNumber}`,
        href: "/admin/returns",
      })),
      ...orders
        .filter((o) => o.status === "APPROVED" || o.status === "FULFILLED")
        .map((o) => ({
          id: `order:${o.id}`,
          type: "ORDER_PAID_OR_COMPLETED",
          createdAt: o.createdAt,
          title: o.status === "FULFILLED" ? "Ordine completato" : "Ordine pagato",
          message: `${o.company?.name || "Azienda"} · Stato ${o.status}`,
          href: "/admin/orders",
        })),
      ...companies.map((c) => ({
        id: `company:${c.id}`,
        type: "NEW_COMPANY_REQUEST",
        createdAt: c.createdAt,
        title: "Nuova richiesta azienda",
        message: `${c.name}`,
        href: "/admin/companies",
      })),
      ...pendingUsers.map((u) => ({
        id: `user:${u.id}`,
        type: "NEW_USER_PENDING",
        createdAt: u.createdAt,
        title: "Nuovo utente in attesa",
        message: `${u.email}${u.company?.name ? ` · ${u.company.name}` : ""}`,
        href: "/admin/companies",
      })),
    ]
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)))
      .slice(0, 60);

    return { items };
  });

  app.get("/suppliers/:id/image", async (request, reply) => {
    const token = getBearerTokenFromRequest(request) || ((request.query as any)?.token as string);
    if (!token) return reply.code(401).send({ error: "Unauthorized", message: "Missing token" });
    const user = await resolveSessionUserFromToken(token);
    if (!user) return reply.code(401).send({ error: "Unauthorized", message: "Invalid token" });
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
