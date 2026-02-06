import { parse } from "csv-parse/sync";
import { Prisma, Supplier } from "@prisma/client";
import { prisma } from "../lib/db.js";

const FIELD_KEYS = [
  "sku",
  "name",
  "description",
  "price",
  "stockQty",
  "imageUrl",
  "brand",
  "category",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

type FieldMap = Record<FieldKey, string | undefined>;

type ParsedRow = Record<string, string>;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.replace(/\./g, "").replace(/,/g, ".").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function buildFieldMap(headers: string[], supplierMap?: any): FieldMap {
  const map: FieldMap = {
    sku: undefined,
    name: undefined,
    description: undefined,
    price: undefined,
    stockQty: undefined,
    imageUrl: undefined,
    brand: undefined,
    category: undefined,
  };

  if (supplierMap && typeof supplierMap === "object") {
    for (const key of FIELD_KEYS) {
      const v = supplierMap[key];
      if (typeof v === "string") map[key] = v;
    }
  }

  const normHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));

  const synonyms: Record<FieldKey, string[]> = {
    sku: ["sku", "codice", "codice_sku", "codice_prodotto", "codiceart", "articolo"],
    name: ["nome", "name", "descrizione_breve", "titolo", "prodotto"],
    description: ["descrizione", "descrizione_lunga", "description"],
    price: ["prezzo", "price", "prezzo_listino", "prezzo_netto"],
    stockQty: ["giacenza", "stock", "qty", "quantita", "quantità"],
    imageUrl: ["immagine", "image", "image_url", "img"],
    brand: ["brand", "marca", "produttore"],
    category: ["categoria", "category", "famiglia"],
  };

  for (const key of FIELD_KEYS) {
    if (map[key]) continue;
    const candidates = synonyms[key].map(normalize);
    const found = normHeaders.find((h) => candidates.includes(h.norm));
    if (found) map[key] = found.raw;
  }

  return map;
}

async function fetchCsv(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ";",
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
  return records as ParsedRow[];
}

function mapRow(row: ParsedRow, fieldMap: FieldMap) {
  const get = (key: FieldKey) => (fieldMap[key] ? row[fieldMap[key] as string] : undefined);

  return {
    sku: get("sku")?.trim(),
    name: get("name")?.trim(),
    description: get("description")?.trim(),
    brand: get("brand")?.trim(),
    category: get("category")?.trim(),
    price: parseNumber(get("price")),
    stockQty: parseNumber(get("stockQty")),
    imageUrl: get("imageUrl")?.trim(),
  };
}

export async function importFullFromSupplier(supplier: Supplier) {
  if (!supplier.csvFullUrl) throw new Error("Missing csvFullUrl");
  const rows = await fetchCsv(supplier.csvFullUrl);
  if (rows.length === 0) return { created: 0, skipped: 0, updated: 0 };

  const headers = Object.keys(rows[0]);
  const fieldMap = buildFieldMap(headers, supplier.fieldMap);
  if (!fieldMap.sku) throw new Error("SKU column not found. Configure supplier.fieldMap.");

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const row of rows) {
    const data = mapRow(row, fieldMap);
    if (!data.sku) continue;

    await prisma.supplierProduct.upsert({
      where: {
        supplierId_supplierSku: {
          supplierId: supplier.id,
          supplierSku: data.sku,
        },
      },
      update: {
        name: data.name,
        description: data.description,
        brand: data.brand,
        category: data.category,
        price: data.price ? new Prisma.Decimal(data.price) : undefined,
        stockQty: data.stockQty ? Math.trunc(data.stockQty) : undefined,
        imageUrl: data.imageUrl,
        raw: row,
        lastSeenAt: new Date(),
      },
      create: {
        supplierId: supplier.id,
        supplierSku: data.sku,
        name: data.name,
        description: data.description,
        brand: data.brand,
        category: data.category,
        price: data.price ? new Prisma.Decimal(data.price) : undefined,
        stockQty: data.stockQty ? Math.trunc(data.stockQty) : undefined,
        imageUrl: data.imageUrl,
        raw: row,
      },
    });

    const existing = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) {
      skipped += 1;
      continue;
    }

    if (!data.name || data.price == null) {
      skipped += 1;
      continue;
    }

    await prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        description: data.description,
        brand: data.brand,
        category: data.category,
        price: new Prisma.Decimal(data.price),
        stockQty: data.stockQty ? Math.trunc(data.stockQty) : 0,
        imageUrl: data.imageUrl,
        source: "SUPPLIER",
        sourceSupplierId: supplier.id,
      },
    });

    created += 1;
  }

  return { created, skipped, updated };
}

export async function importStockFromSupplier(supplier: Supplier) {
  if (!supplier.csvStockUrl) throw new Error("Missing csvStockUrl");
  const rows = await fetchCsv(supplier.csvStockUrl);
  if (rows.length === 0) return { updated: 0, missing: 0 };

  const headers = Object.keys(rows[0]);
  const fieldMap = buildFieldMap(headers, supplier.fieldMap);
  if (!fieldMap.sku) throw new Error("SKU column not found. Configure supplier.fieldMap.");

  let updated = 0;
  let missing = 0;

  for (const row of rows) {
    const data = mapRow(row, fieldMap);
    if (!data.sku) continue;
    const qty = data.stockQty != null ? Math.trunc(data.stockQty) : undefined;

    if (qty == null) continue;

    const res = await prisma.product.updateMany({
      where: { sku: data.sku },
      data: { stockQty: qty },
    });

    await prisma.supplierProduct.updateMany({
      where: { supplierId: supplier.id, supplierSku: data.sku },
      data: { stockQty: qty, lastSeenAt: new Date() },
    });

    if (res.count === 0) missing += 1;
    else updated += res.count;
  }

  return { updated, missing };
}
