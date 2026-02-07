import { parse } from "csv-parse/sync";
import { Prisma, Supplier } from "@prisma/client";
import { prisma } from "../lib/db.js";
import http from "node:http";
import https from "node:https";

const FIELD_KEYS = [
  "sku",
  "name",
  "shortDescription",
  "description",
  "price",
  "stockQty",
  "imageUrl",
  "imageUrls",
  "brand",
  "category",
  "subcategory",
  "published",
  "visibility",
  "productType",
  "parentSku",
  "childSkus",
  "codicePl",
  "mlProduct",
  "nicotine",
  "exciseMl",
  "exciseProduct",
  "taxRate",
  "purchasePrice",
  "listPrice",
  "discountPrice",
  "discountQty",
  "barcode",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

type FieldMap = Record<FieldKey, string | undefined>;

type ParsedRow = Record<string, string>;

async function getSettings() {
  return prisma.appSetting.findFirst();
}

function computeTaxes(input: {
  price?: number;
  taxRate?: number;
  exciseMl?: number;
  exciseProduct?: number;
  mlProduct?: number;
}) {
  const exciseTotal =
    input.exciseProduct != null
      ? input.exciseProduct
      : input.exciseMl != null && input.mlProduct != null
      ? input.exciseMl * input.mlProduct
      : undefined;
  const taxAmount =
    input.price != null && input.taxRate != null ? (input.price * input.taxRate) / 100 : undefined;
  return { exciseTotal, taxAmount };
}

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

function parseBoolean(value: string | undefined) {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "si" || v === "sì" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return undefined;
}

function parseList(value: string | undefined) {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
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
    shortDescription: ["breve_descrizione", "descrizione_breve", "short_description"],
    description: ["descrizione", "descrizione_lunga", "description"],
    price: ["prezzo", "price", "prezzo_listino", "prezzo_netto", "prezzo_wls"],
    stockQty: ["giacenza", "stock", "qty", "quantita", "quantità", "qta"],
    imageUrl: ["immagine", "image", "image_url", "img"],
    imageUrls: ["immagini", "image_list", "image_urls"],
    brand: ["brand", "marca", "produttore"],
    category: ["categoria", "category", "famiglia", "albero_categorie"],
    subcategory: ["sottocategorie", "sottocategoria", "subcategory"],
    published: ["pubblicato", "published"],
    visibility: ["visibilità_nel_catalogo", "visibilita_nel_catalogo", "visibility"],
    productType: ["prodotto", "tipo_prodotto", "product_type"],
    parentSku: ["padre", "parent", "parent_sku"],
    childSkus: ["figli", "children", "child_skus"],
    codicePl: ["codice_pl", "codice_pls", "codicepl"],
    mlProduct: ["ml_prodotto", "ml", "ml_prodotto"],
    nicotine: ["nicotina", "nicotine"],
    exciseMl: ["accisa_ml", "accisa_ml", "accisa_ml"],
    exciseProduct: ["accisa_prodotto", "accisa_prodotto"],
    taxRate: ["aliquota_di_imposta", "aliquota_imposta", "iva", "tax_rate"],
    purchasePrice: ["prezzo_di_acquisto", "prezzo_acquisto"],
    listPrice: ["prezzo_di_listino", "prezzo_listino"],
    discountPrice: ["prezzi_scontato_per_quantità", "prezzo_scontato", "discount_price"],
    discountQty: ["quantità_per_sconto", "quantita_per_sconto", "discount_qty"],
    barcode: ["codice_a_barre", "barcode", "ean"],
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

function getLocalized(value: any) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first.value === "string") return first.value;
  }
  if (value && typeof value.value === "string") return value.value;
  return undefined;
}

async function prestashopGet(supplier: Supplier, path: string, params: Record<string, string>) {
  const apiBaseUrl = supplier.apiBaseUrl?.trim();
  const apiKey = supplier.apiKey?.trim();
  const apiHost = supplier.apiHost?.trim();
  if (!apiBaseUrl || !apiKey) {
    throw new Error("Missing PrestaShop apiBaseUrl/apiKey");
  }
  const base = apiBaseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  const search = new URLSearchParams(params);
  search.set("ws_key", apiKey);
  search.set("output_format", "JSON");
  url.search = search.toString();

  const body = await new Promise<string>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers: {
          ...(apiHost ? { Host: apiHost } : {}),
          "User-Agent": "4vape-importer",
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) {
            return reject(
              new Error(
                `PrestaShop fetch failed: ${res.statusCode} (url=${url.toString()} host=${apiHost || ""})`
              )
            );
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });

  return JSON.parse(body);
}

async function prestashopListAll(
  supplier: Supplier,
  path: string,
  pageSize = 100,
  opts?: { allowNotFound?: boolean; allowForbidden?: boolean }
) {
  let offset = 0;
  const all: any[] = [];
  while (true) {
    let data: any;
    try {
      data = await prestashopGet(supplier, path, {
        display: "full",
        limit: `${offset},${pageSize}`,
      });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (opts?.allowNotFound && msg.includes("404")) {
        return all;
      }
      if (opts?.allowForbidden && (msg.includes("401") || msg.includes("403"))) {
        return all;
      }
      throw err;
    }
    if (
      opts?.allowForbidden &&
      Array.isArray(data?.errors) &&
      data.errors.some((e: any) => String(e?.code) === "26")
    ) {
      return all;
    }
    const key = path.replace(/\//g, "");
    const items =
      data?.[key] ||
      data?.products ||
      data?.stock_availables ||
      data?.combinations ||
      data?.categories ||
      [];
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function mapRow(row: ParsedRow, fieldMap: FieldMap) {
  const get = (key: FieldKey) => (fieldMap[key] ? row[fieldMap[key] as string] : undefined);

  return {
    sku: get("sku")?.trim(),
    name: get("name")?.trim(),
    shortDescription: get("shortDescription")?.trim(),
    description: get("description")?.trim(),
    brand: get("brand")?.trim(),
    category: get("category")?.trim(),
    subcategory: get("subcategory")?.trim(),
    price: parseNumber(get("price")),
    stockQty: parseNumber(get("stockQty")),
    imageUrl: get("imageUrl")?.trim(),
    imageUrls: parseList(get("imageUrls")),
    published: parseBoolean(get("published")),
    visibility: get("visibility")?.trim(),
    productType: get("productType")?.trim(),
    parentSku: get("parentSku")?.trim(),
    childSkus: parseList(get("childSkus")),
    codicePl: get("codicePl")?.trim(),
    mlProduct: parseNumber(get("mlProduct")),
    nicotine: parseNumber(get("nicotine")),
    exciseMl: parseNumber(get("exciseMl")),
    exciseProduct: parseNumber(get("exciseProduct")),
    taxRate: parseNumber(get("taxRate")),
    purchasePrice: parseNumber(get("purchasePrice")),
    listPrice: parseNumber(get("listPrice")),
    discountPrice: parseNumber(get("discountPrice")),
    discountQty: parseNumber(get("discountQty")),
    barcode: get("barcode")?.trim(),
  };
}

export async function importFullFromSupplier(supplier: Supplier) {
  let created = 0;
  let skipped = 0;
  let updated = 0;
  const settings = await getSettings();
  const defaultVat = settings?.vatRateDefault ? Number(settings.vatRateDefault) : undefined;
  const defaultExciseMl = settings?.exciseMlDefault ? Number(settings.exciseMlDefault) : undefined;
  const defaultExciseProduct = settings?.exciseProductDefault
    ? Number(settings.exciseProductDefault)
    : undefined;

  if (supplier.apiType === "PRESTASHOP") {
    const [products, combinations, categories] = await Promise.all([
      prestashopListAll(supplier, "/products"),
      prestashopListAll(supplier, "/combinations", 100, {
        allowNotFound: true,
        allowForbidden: true,
      }),
      prestashopListAll(supplier, "/categories", 100, { allowNotFound: true }),
    ]);
    if (products.length === 0) return { created, skipped, updated };

    const categoryMap = new Map<string, string>();
    for (const c of categories) {
      const name = getLocalized(c.name) || String(c.id);
      categoryMap.set(String(c.id), name);
    }

    const productMap = new Map<string, any>();
    for (const p of products) {
      productMap.set(String(p.id), p);
    }

    for (const p of products) {
      const sku = p.reference || String(p.id);
      const name = getLocalized(p.name) || `Product ${p.id}`;
      const description = getLocalized(p.description_short || p.description);
      const price = p.price ? Number(p.price) : undefined;
      const stockQty = p.quantity != null ? Math.trunc(Number(p.quantity)) : undefined;
      const brand = p.manufacturer_name || undefined;
      const category = p.id_category_default ? categoryMap.get(String(p.id_category_default)) : undefined;
      const images = p.associations?.images || [];
      const imageId = p.id_default_image || p.id_default_image?.id || images[0]?.id;
      const imageUrl = imageId
        ? `/api/suppliers/${supplier.id}/image?productId=${p.id}&imageId=${imageId}`
        : undefined;
      const taxRate = defaultVat;
      const exciseMl = defaultExciseMl;
      const exciseProduct = defaultExciseProduct;
      const mlProduct = undefined;
      const { exciseTotal, taxAmount } = computeTaxes({
        price,
        taxRate,
        exciseMl,
        exciseProduct,
        mlProduct,
      });

      await prisma.supplierProduct.upsert({
        where: {
          supplierId_supplierSku: {
            supplierId: supplier.id,
            supplierSku: sku,
          },
        },
        update: {
          name,
          description,
          brand,
          category,
          price: price != null ? new Prisma.Decimal(price) : undefined,
          taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
          exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
          exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
          exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
          taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
          stockQty,
          imageUrl,
          raw: p,
          lastSeenAt: new Date(),
        },
        create: {
          supplierId: supplier.id,
          supplierSku: sku,
          name,
          description,
          brand,
          category,
          price: price != null ? new Prisma.Decimal(price) : undefined,
          taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
          exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
          exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
          exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
          taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
          stockQty,
          imageUrl,
          raw: p,
        },
      });

      updated += 1;
    }

    // Import combinations as separate supplier products (variants)
    for (const c of combinations) {
      const parent = productMap.get(String(c.id_product));
      const sku = c.reference || `${c.id_product}-${c.id}`;
      const name = parent ? `${getLocalized(parent.name) || "Product"} - Variant` : `Variant ${c.id}`;
      const description = getLocalized(c.description_short || c.description);
      const price = c.price ? Number(c.price) : undefined;
      const stockQty = c.quantity != null ? Math.trunc(Number(c.quantity)) : undefined;
      const brand = parent?.manufacturer_name || undefined;
      const category = parent?.id_category_default
        ? categoryMap.get(String(parent.id_category_default))
        : undefined;
      const images = parent?.associations?.images || [];
      const imageId = parent?.id_default_image || parent?.id_default_image?.id || images[0]?.id;
      const imageUrl = imageId
        ? `/api/suppliers/${supplier.id}/image?productId=${parent.id}&imageId=${imageId}`
        : undefined;
      const taxRate = defaultVat;
      const exciseMl = defaultExciseMl;
      const exciseProduct = defaultExciseProduct;
      const mlProduct = undefined;
      const { exciseTotal, taxAmount } = computeTaxes({
        price,
        taxRate,
        exciseMl,
        exciseProduct,
        mlProduct,
      });

      await prisma.supplierProduct.upsert({
        where: {
          supplierId_supplierSku: {
            supplierId: supplier.id,
            supplierSku: sku,
          },
        },
        update: {
          name,
          description,
          brand,
          category,
          price: price != null ? new Prisma.Decimal(price) : undefined,
          taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
          exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
          exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
          exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
          taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
          stockQty,
          imageUrl,
          raw: c,
          lastSeenAt: new Date(),
        },
        create: {
          supplierId: supplier.id,
          supplierSku: sku,
          name,
          description,
          brand,
          category,
          price: price != null ? new Prisma.Decimal(price) : undefined,
          taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
          exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
          exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
          exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
          taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
          stockQty,
          imageUrl,
          raw: c,
        },
      });
      updated += 1;
    }
    return { created, skipped, updated };
  }

  if (!supplier.csvFullUrl) throw new Error("Missing csvFullUrl");
  const rows = await fetchCsv(supplier.csvFullUrl);
  if (rows.length === 0) return { created, skipped, updated };

  const headers = Object.keys(rows[0]);
  const fieldMap = buildFieldMap(headers, supplier.fieldMap);
  if (!fieldMap.sku) throw new Error("SKU column not found. Configure supplier.fieldMap.");

  for (const row of rows) {
    const data = mapRow(row, fieldMap);
    if (!data.sku) continue;
    const taxRate = data.taxRate ?? defaultVat;
    const exciseMl = data.exciseMl ?? defaultExciseMl;
    const exciseProduct = data.exciseProduct ?? defaultExciseProduct;
    const mlProduct = data.mlProduct;
    const price = data.listPrice ?? data.price;
    const { exciseTotal, taxAmount } = computeTaxes({
      price,
      taxRate,
      exciseMl,
      exciseProduct,
      mlProduct,
    });

    await prisma.supplierProduct.upsert({
      where: {
        supplierId_supplierSku: {
          supplierId: supplier.id,
          supplierSku: data.sku,
        },
      },
      update: {
        name: data.name,
        shortDescription: data.shortDescription,
        description: data.description,
        brand: data.brand,
        category: data.category,
        subcategory: data.subcategory,
        published: data.published,
        visibility: data.visibility,
        productType: data.productType,
        parentSku: data.parentSku,
        childSkus: data.childSkus,
        codicePl: data.codicePl,
        mlProduct: data.mlProduct != null ? new Prisma.Decimal(data.mlProduct) : undefined,
        nicotine: data.nicotine != null ? new Prisma.Decimal(data.nicotine) : undefined,
        exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
        exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
        exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
        taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
        taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
        price: price != null ? new Prisma.Decimal(price) : undefined,
        purchasePrice: data.purchasePrice != null ? new Prisma.Decimal(data.purchasePrice) : undefined,
        listPrice: data.listPrice != null ? new Prisma.Decimal(data.listPrice) : undefined,
        discountPrice: data.discountPrice != null ? new Prisma.Decimal(data.discountPrice) : undefined,
        discountQty: data.discountQty != null ? Math.trunc(data.discountQty) : undefined,
        stockQty: data.stockQty ? Math.trunc(data.stockQty) : undefined,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        barcode: data.barcode,
        raw: row,
        lastSeenAt: new Date(),
      },
      create: {
        supplierId: supplier.id,
        supplierSku: data.sku,
        name: data.name,
        shortDescription: data.shortDescription,
        description: data.description,
        brand: data.brand,
        category: data.category,
        subcategory: data.subcategory,
        published: data.published,
        visibility: data.visibility,
        productType: data.productType,
        parentSku: data.parentSku,
        childSkus: data.childSkus,
        codicePl: data.codicePl,
        mlProduct: data.mlProduct != null ? new Prisma.Decimal(data.mlProduct) : undefined,
        nicotine: data.nicotine != null ? new Prisma.Decimal(data.nicotine) : undefined,
        exciseMl: exciseMl != null ? new Prisma.Decimal(exciseMl) : undefined,
        exciseProduct: exciseProduct != null ? new Prisma.Decimal(exciseProduct) : undefined,
        exciseTotal: exciseTotal != null ? new Prisma.Decimal(exciseTotal) : undefined,
        taxRate: taxRate != null ? new Prisma.Decimal(taxRate) : undefined,
        taxAmount: taxAmount != null ? new Prisma.Decimal(taxAmount) : undefined,
        price: price != null ? new Prisma.Decimal(price) : undefined,
        purchasePrice: data.purchasePrice != null ? new Prisma.Decimal(data.purchasePrice) : undefined,
        listPrice: data.listPrice != null ? new Prisma.Decimal(data.listPrice) : undefined,
        discountPrice: data.discountPrice != null ? new Prisma.Decimal(data.discountPrice) : undefined,
        discountQty: data.discountQty != null ? Math.trunc(data.discountQty) : undefined,
        stockQty: data.stockQty ? Math.trunc(data.stockQty) : undefined,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        barcode: data.barcode,
        raw: row,
      },
    });
    updated += 1;
  }

  return { created, skipped, updated };
}

export async function importStockFromSupplier(supplier: Supplier) {
  let updated = 0;
  let missing = 0;

  if (supplier.apiType === "PRESTASHOP") {
    const products = await prestashopListAll(supplier, "/products");
    const combinations = await prestashopListAll(supplier, "/combinations");
    const idToSku = new Map<string, string>();
    const combinationToSku = new Map<string, string>();
    for (const p of products) {
      const sku = p.reference || String(p.id);
      idToSku.set(String(p.id), sku);
    }
    for (const c of combinations) {
      const sku = c.reference || `${c.id_product}-${c.id}`;
      combinationToSku.set(String(c.id), sku);
    }

    const stocks = await prestashopListAll(supplier, "/stock_availables");
    if (stocks.length === 0) return { updated: 0, missing: 0 };

    for (const s of stocks) {
      const sku = s.id_product_attribute && String(s.id_product_attribute) !== "0"
        ? combinationToSku.get(String(s.id_product_attribute))
        : s.id_product
        ? idToSku.get(String(s.id_product))
        : undefined;
      const qty = s.quantity != null ? Math.trunc(Number(s.quantity)) : undefined;
      if (!sku || qty == null) continue;

      const res = await prisma.product.updateMany({
        where: { sku },
        data: { stockQty: qty },
      });

      await prisma.supplierProduct.updateMany({
        where: { supplierId: supplier.id, supplierSku: sku },
        data: { stockQty: qty, lastSeenAt: new Date() },
      });

      if (res.count === 0) missing += 1;
      else updated += res.count;
    }
    return { updated, missing };
  }

  if (!supplier.csvStockUrl) throw new Error("Missing csvStockUrl");
  const rows = await fetchCsv(supplier.csvStockUrl);
  if (rows.length === 0) return { updated: 0, missing: 0 };

  const headers = Object.keys(rows[0]);
  const fieldMap = buildFieldMap(headers, supplier.fieldMap);
  if (!fieldMap.sku) throw new Error("SKU column not found. Configure supplier.fieldMap.");

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
