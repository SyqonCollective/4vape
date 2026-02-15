import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const newRow = () => ({
  sku: "",
  name: "",
  codicePl: "",
  qty: 1,
  unitCost: "",
  unitPrice: "",
  discount: "",
  rowTotal: 0,
  description: "",
  shortDescription: "",
  brand: "",
  category: "",
  subcategory: "",
  barcode: "",
  nicotine: "",
  mlProduct: "",
  taxRateId: "",
  exciseRateId: "",
  lineNote: "",
  imageUrl: "",
});

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

const CSV_HEADERS = [
  "sku",
  "name",
  "codicePl",
  "qty",
  "unitCost",
  "discount",
  "brand",
  "category",
  "subcategory",
  "barcode",
  "nicotine",
  "mlProduct",
  "taxRate",
  "exciseRate",
  "lineNote",
];

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export default function AdminGoodsReceipts() {
  const fileInputRef = useRef(null);
  const skuLookupTimersRef = useRef({});
  const editSkuLookupTimersRef = useRef({});
  const [rows, setRows] = useState([newRow(), newRow(), newRow()]);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [inventorySkuSet, setInventorySkuSet] = useState(new Set());
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [editSupplierName, setEditSupplierName] = useState("");
  const [editReference, setEditReference] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRows, setEditRows] = useState([]);
  const [pendingImportRows, setPendingImportRows] = useState([]);
  const [conflictSkus, setConflictSkus] = useState([]);
  const [skuInfoCache, setSkuInfoCache] = useState({});

  async function loadReceipts() {
    try {
      const res = await api("/admin/goods-receipts");
      setReceipts(res || []);
    } catch {
      setError("Impossibile caricare arrivi merci");
    }
  }

  useEffect(() => {
    loadReceipts();
  }, []);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [taxRes, exciseRes, invRes] = await Promise.all([
          api("/admin/taxes"),
          api("/admin/excises"),
          api("/admin/inventory/items?limit=1000"),
        ]);
        setTaxes(taxRes || []);
        setExcises(exciseRes || []);
        setInventorySkuSet(new Set((invRes || []).map((x) => String(x.sku || "").trim()).filter(Boolean)));
      } catch {
        setError("Impossibile caricare IVA/Accise");
      }
    }
    loadMeta();
  }, []);

  async function fetchSkuInfo(sku) {
    const key = String(sku || "").trim();
    if (!key) return null;
    if (skuInfoCache[key]) return skuInfoCache[key];
    try {
      const info = await api(`/admin/goods-receipts/sku-info?sku=${encodeURIComponent(key)}`);
      setSkuInfoCache((prev) => ({ ...prev, [key]: info }));
      return info;
    } catch {
      return null;
    }
  }

  function mergeRowWithSkuInfo(row, info) {
    if (!info?.found) return row;
    const inv = info.inventory || {};
    const prod = info.product || {};
    const pick = (...values) => {
      for (const v of values) {
        if (v !== undefined && v !== null && v !== "") return v;
      }
      return "";
    };
    return {
      ...row,
      name: pick(inv.name, prod.name, row.name),
      codicePl: pick(prod.codicePl, row.codicePl),
      description: pick(inv.description, prod.description, row.description),
      shortDescription: pick(inv.shortDescription, prod.shortDescription, row.shortDescription),
      brand: pick(inv.brand, prod.brand, row.brand),
      category: pick(inv.category, prod.category, row.category),
      subcategory: pick(inv.subcategory, prod.subcategory, row.subcategory),
      barcode: pick(inv.barcode, prod.barcode, row.barcode),
      nicotine: String(pick(inv.nicotine, prod.nicotine, row.nicotine)),
      mlProduct: String(pick(inv.mlProduct, prod.mlProduct, row.mlProduct)),
      taxRateId: pick(inv.taxRateId, prod.taxRateId, row.taxRateId),
      exciseRateId: pick(inv.exciseRateId, prod.exciseRateId, row.exciseRateId),
      unitCost:
        info.last?.unitCost !== null && info.last?.unitCost !== undefined
          ? String(info.last.unitCost)
          : row.unitCost !== ""
            ? row.unitCost
            : inv.purchasePrice !== undefined && inv.purchasePrice !== null
              ? String(inv.purchasePrice)
              : prod.purchasePrice !== undefined && prod.purchasePrice !== null
                ? String(prod.purchasePrice)
                : prod.price !== undefined && prod.price !== null
                  ? String(prod.price)
                  : "",
      unitPrice:
        row.unitPrice !== ""
          ? row.unitPrice
          : inv.price !== undefined && inv.price !== null
            ? String(inv.price)
            : prod.price !== undefined && prod.price !== null
              ? String(prod.price)
              : "",
      imageUrl:
        pick(
          prod.imageUrl,
          Array.isArray(prod.imageUrls) && prod.imageUrls.length ? prod.imageUrls[0] : "",
          row.imageUrl
        ) ||
        row.imageUrl ||
        "",
    };
  }

  function scheduleSkuLookup(index, sku, edit = false) {
    const timers = edit ? editSkuLookupTimersRef.current : skuLookupTimersRef.current;
    const key = String(index);
    if (timers[key]) clearTimeout(timers[key]);
    const cleanSku = String(sku || "").trim();
    if (!cleanSku || cleanSku.length < 2) return;
    timers[key] = setTimeout(async () => {
      const info = await fetchSkuInfo(cleanSku);
      if (!info?.found) return;
      if (edit) {
        setEditRows((prev) =>
          prev.map((row, i) =>
            i === index && String(row.sku || "").trim() === cleanSku ? mergeRowWithSkuInfo(row, info) : row
          )
        );
      } else {
        setRows((prev) =>
          prev.map((row, i) =>
            i === index && String(row.sku || "").trim() === cleanSku ? mergeRowWithSkuInfo(row, info) : row
          )
        );
      }
    }, 240);
  }

  async function enrichRowsFromSku(inputRows) {
    const enriched = await Promise.all(
      inputRows.map(async (row) => {
        const sku = String(row.sku || "").trim();
        if (!sku) return row;
        const info = await fetchSkuInfo(sku);
        return mergeRowWithSkuInfo(row, info);
      })
    );
    return enriched;
  }

  const parsedRows = useMemo(
    () => rows.filter((r) => r.sku.trim() && Number(r.qty || 0) > 0),
    [rows]
  );

  const stats = useMemo(() => {
    return parsedRows.reduce(
      (acc, row) => {
        const qty = Number(row.qty || 0);
        const unitCost = Number(row.unitCost || 0);
        const rowNet = qty * unitCost;
        const ml = Number(row.mlProduct || 0);
        const tax = taxes.find((t) => t.id === row.taxRateId);
        const excise = excises.find((e) => e.id === row.exciseRateId);
        const exciseUnit = excise
          ? excise.type === "ML"
            ? Number(excise.amount || 0) * ml
            : Number(excise.amount || 0)
          : 0;
        const taxRate = Number(tax?.rate || 0);
        const vatUnit = taxRate > 0 ? (unitCost + exciseUnit) * (taxRate / 100) : 0;
        acc.lines += 1;
        acc.qty += qty;
        acc.cost += rowNet;
        acc.subtotal += rowNet;
        acc.excise += qty * exciseUnit;
        acc.vat += qty * vatUnit;
        return acc;
      },
      { lines: 0, qty: 0, cost: 0, subtotal: 0, excise: 0, vat: 0 }
    );
  }, [parsedRows, taxes, excises]);

  function updateRow(index, patch) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    if (Object.prototype.hasOwnProperty.call(patch, "sku")) {
      scheduleSkuLookup(index, patch.sku, false);
    }
  }

  async function handleSkuBlur(index) {
    const sku = String(rows[index]?.sku || "").trim();
    if (!sku) return;
    const info = await fetchSkuInfo(sku);
    if (!info?.found) return;
    setRows((prev) =>
      prev.map((row, i) => (i === index ? mergeRowWithSkuInfo(row, info) : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function applyPaste() {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const parsed = lines.map((line) => {
      const cols = line.includes("\t") ? line.split("\t") : line.split(/[;,]/);
      return {
        sku: (cols[0] || "").trim(),
        name: (cols[1] || "").trim(),
        codicePl: (cols[2] || "").trim(),
        qty: Number(String(cols[3] || "1").replace(",", ".")) || 1,
        unitCost: String(cols[4] || "").trim(),
        discount: String(cols[5] || "").trim(),
        brand: (cols[6] || "").trim(),
        category: (cols[7] || "").trim(),
        subcategory: (cols[8] || "").trim(),
        barcode: (cols[9] || "").trim(),
        nicotine: String(cols[10] || "").trim(),
        mlProduct: String(cols[11] || "").trim(),
        taxRateId: "",
        exciseRateId: "",
        lineNote: "",
        description: "",
        shortDescription: "",
        imageUrl: "",
        unitPrice: "",
      };
    });
    const enriched = await enrichRowsFromSku(parsed);
    setRows(enriched);
    setPasteText("");
  }

  function downloadTemplateCsv() {
    const sample = [
      "SKU-001",
      "Prodotto esempio",
      "PL-0001",
      "10",
      "3.50",
      "0",
      "Brand Demo",
      "Categoria Demo",
      "Subcategoria Demo",
      "1234567890123",
      "10",
      "10",
      "22%",
      "10ML CON",
      "Nota riga",
    ];
    const content = `${CSV_HEADERS.join(";")}\n${sample.join(";")}\n`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template_arrivo_merci.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function normalizeRateId(value, list) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const byId = list.find((x) => x.id === raw);
    if (byId) return byId.id;
    const byName = list.find((x) => String(x.name || "").toLowerCase() === raw.toLowerCase());
    if (byName) return byName.id;
    const byRate = list.find(
      (x) => String(x.rate || "").replace(",", ".") === raw.replace("%", "").replace(",", ".")
    );
    return byRate?.id || "";
  }

  async function onCsvImport(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setError("CSV vuoto o non valido");
        return;
      }
      const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const idx = (k) => headers.indexOf(k.toLowerCase());
      const parsed = lines.slice(1).map((line) => {
        const cols = splitCsvLine(line);
        const taxRaw = cols[idx("taxRate")] || "";
        const exciseRaw = cols[idx("exciseRate")] || "";
        const qtyIdx = idx("qty");
        const unitCostIdx = idx("unitCost");
        const discountIdx = idx("discount");
        return {
          sku: String(cols[idx("sku")] || "").trim(),
          name: String(cols[idx("name")] || "").trim(),
          codicePl: String(cols[idx("codicePl")] || "").trim(),
          qty: Number(String(cols[qtyIdx] || "1").replace(",", ".")) || 1,
          unitCost: String(cols[unitCostIdx] || "").trim(),
          discount: String(cols[discountIdx] || "").trim(),
          unitPrice: "",
          brand: String(cols[idx("brand")] || "").trim(),
          category: String(cols[idx("category")] || "").trim(),
          subcategory: String(cols[idx("subcategory")] || "").trim(),
          barcode: String(cols[idx("barcode")] || "").trim(),
          nicotine: String(cols[idx("nicotine")] || "").trim(),
          mlProduct: String(cols[idx("mlProduct")] || "").trim(),
          taxRateId: normalizeRateId(taxRaw, taxes),
          exciseRateId: normalizeRateId(exciseRaw, excises),
          lineNote: String(cols[idx("lineNote")] || "").trim(),
          description: "",
          shortDescription: "",
          imageUrl: "",
        };
      }).filter((row) => row.sku && row.qty > 0);

      if (!parsed.length) {
        setError("Nessuna riga valida nel CSV");
        return;
      }

      const conflicts = [...new Set(parsed.map((r) => r.sku).filter((sku) => inventorySkuSet.has(sku)))];
      if (conflicts.length > 0) {
        setPendingImportRows(parsed);
        setConflictSkus(conflicts);
        return;
      }

      const enriched = await enrichRowsFromSku(parsed);
      setRows(enriched);
      setSuccess(`CSV importato: ${parsed.length} righe caricate.`);
    } catch {
      setError("Errore durante import CSV");
    }
  }

  async function applyImportResolution(mode) {
    const usedSkus = new Set([...inventorySkuSet]);
    const rowsToApply = pendingImportRows.map((row) => {
      if (!usedSkus.has(row.sku)) {
        usedSkus.add(row.sku);
        return row;
      }
      if (mode === "update") return row;
      let nextSku = `${row.sku}-DUP`;
      let counter = 1;
      while (usedSkus.has(nextSku)) {
        nextSku = `${row.sku}-DUP${counter}`;
        counter += 1;
      }
      usedSkus.add(nextSku);
      return {
        ...row,
        sku: nextSku,
        lineNote: row.lineNote ? `${row.lineNote} | DUP da CSV` : "DUP da CSV",
      };
    });
    const enriched = await enrichRowsFromSku(rowsToApply);
    setRows(enriched);
    setConflictSkus([]);
    setPendingImportRows([]);
    setSuccess(
      mode === "update"
        ? "CSV importato: SKU esistenti impostati in aggiornamento inventario."
        : "CSV importato: SKU esistenti duplicati con nuovo codice."
    );
  }

  async function saveReceipt() {
    if (!parsedRows.length) {
      setError("Inserisci almeno una riga valida");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await api("/admin/goods-receipts", {
        method: "POST",
        body: JSON.stringify({
          supplierName: supplierName || null,
          reference: reference || null,
          notes: notes || null,
          lines: parsedRows.map((r) => ({
            sku: r.sku.trim(),
            name: r.name.trim() || null,
            qty: Number(r.qty || 0),
            unitCost: r.unitCost === "" ? null : Number(r.unitCost),
            unitPrice:
              r.unitPrice === ""
                ? r.unitCost === ""
                  ? null
                  : Number(r.unitCost)
                : Number(r.unitPrice),
            description: r.description || null,
            shortDescription: r.shortDescription || null,
            brand: r.brand || null,
            category: r.category || null,
            subcategory: r.subcategory || null,
            barcode: r.barcode || null,
            nicotine: r.nicotine === "" ? null : Number(r.nicotine),
            mlProduct: r.mlProduct === "" ? null : Number(r.mlProduct),
            taxRateId: r.taxRateId || null,
            exciseRateId: r.exciseRateId || null,
            lineNote: [r.lineNote || null, r.discount ? `SCONTO:${r.discount}%` : null]
              .filter(Boolean)
              .join(" | ") || null,
          })),
        }),
      });
      setSuccess(
        `Carico ${res.receiptNo} salvato. ${res.createdItems} creati, ${res.updatedItems} aggiornati.`
      );
      setRows([newRow(), newRow(), newRow()]);
      setSupplierName("");
      setReference("");
      setNotes("");
      await loadReceipts();
    } catch {
      setError("Impossibile salvare arrivo merci");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReceipt(id) {
    try {
      await api(`/admin/goods-receipts/${id}`, { method: "DELETE" });
      setSuccess("Arrivo merci eliminato correttamente.");
      setConfirmDelete(null);
      await loadReceipts();
    } catch {
      setError("Impossibile eliminare arrivo merci");
    }
  }

  function updateEditRow(index, patch) {
    setEditRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    if (Object.prototype.hasOwnProperty.call(patch, "sku")) {
      scheduleSkuLookup(index, patch.sku, true);
    }
  }

  async function handleEditSkuBlur(index) {
    const sku = String(editRows[index]?.sku || "").trim();
    if (!sku) return;
    const info = await fetchSkuInfo(sku);
    if (!info?.found) return;
    setEditRows((prev) =>
      prev.map((row, i) => (i === index ? mergeRowWithSkuInfo(row, info) : row))
    );
  }

  function addEditRow() {
    setEditRows((prev) => [...prev, newRow()]);
  }

  function removeEditRow(index) {
    setEditRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function openEditReceipt(id) {
    try {
      const res = await api(`/admin/goods-receipts/${id}`);
      setEditingReceipt(res);
      setEditSupplierName(res.supplierName || "");
      setEditReference(res.reference || "");
      setEditNotes(res.notes || "");
      setEditRows(
        (res.lines || []).map((line) => ({
          ...(function parseDiscount() {
            const raw = String(line.lineNote || "");
            const match = raw.match(/SCONTO:([0-9]+(?:[.,][0-9]+)?)%/i);
            return { discount: match ? match[1].replace(",", ".") : "" };
          })(),
          sku: line.sku || "",
          name: line.name || "",
          codicePl: line.item?.codicePl || "",
          qty: Number(line.qty || 1),
          unitCost: line.unitCost ?? "",
          unitPrice: line.unitPrice ?? "",
          description: line.item?.description || "",
          shortDescription: line.item?.shortDescription || "",
          brand: line.item?.brand || "",
          category: line.item?.category || "",
          subcategory: line.item?.subcategory || "",
          barcode: line.item?.barcode || "",
          nicotine: line.item?.nicotine ?? "",
          mlProduct: line.item?.mlProduct ?? "",
          taxRateId: line.item?.taxRateId || "",
          exciseRateId: line.item?.exciseRateId || "",
          lineNote: line.lineNote || "",
        }))
      );
    } catch {
      setError("Impossibile aprire modifica carico");
    }
  }

  async function saveEditedReceipt() {
    if (!editingReceipt) return;
    const validRows = editRows.filter((r) => r.sku.trim() && Number(r.qty || 0) > 0);
    if (!validRows.length) {
      setError("Inserisci almeno una riga valida");
      return;
    }
    setSaving(true);
    try {
      await api(`/admin/goods-receipts/${editingReceipt.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          supplierName: editSupplierName || null,
          reference: editReference || null,
          notes: editNotes || null,
          lines: validRows.map((r) => ({
            sku: r.sku.trim(),
            name: r.name.trim() || null,
            qty: Number(r.qty || 0),
            unitCost: r.unitCost === "" ? null : Number(r.unitCost),
            unitPrice:
              r.unitPrice === ""
                ? r.unitCost === ""
                  ? null
                  : Number(r.unitCost)
                : Number(r.unitPrice),
            description: r.description || null,
            shortDescription: r.shortDescription || null,
            brand: r.brand || null,
            category: r.category || null,
            subcategory: r.subcategory || null,
            barcode: r.barcode || null,
            nicotine: r.nicotine === "" ? null : Number(r.nicotine),
            mlProduct: r.mlProduct === "" ? null : Number(r.mlProduct),
            taxRateId: r.taxRateId || null,
            exciseRateId: r.exciseRateId || null,
            lineNote: [r.lineNote || null, r.discount ? `SCONTO:${r.discount}%` : null]
              .filter(Boolean)
              .join(" | ") || null,
          })),
        }),
      });
      setEditingReceipt(null);
      setSuccess("Carico aggiornato e inventario riallineato.");
      await loadReceipts();
    } catch {
      setError("Impossibile salvare modifica carico");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Arrivo merci</h1>
          <p>Inserimento massivo rapido per magazzino interno</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />
      {success ? <div className="success-banner">{success}</div> : null}

      <div className="goods-layout">
        <div className="goods-main">
          <div className="order-card">
            <div className="card-title">Dati carico</div>
            <div className="order-form">
              <div>
                <label>Fornitore interno</label>
                <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              </div>
              <div>
                <label>Riferimento documento</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Note arrivo merci</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="order-card">
            <div className="card-title">Incolla da Excel/CSV</div>
            <p className="field-hint">
              Ordine colonne: SKU, Nome, CodicePL, Qta, PrezzoNetto, Sconto, Brand, Categoria, Sottocategoria, Barcode, Nicotina, ML
            </p>
            <textarea
              className="goods-paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="SKU123\tProdotto A\tPL123\t12\t3.50\t0"
            />
            <div className="actions">
              <button className="btn ghost" onClick={downloadTemplateCsv}>
                Scarica template CSV
              </button>
              <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
                Importa CSV
              </button>
              <button className="btn ghost" onClick={applyPaste}>Applica incolla</button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                onCsvImport(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="order-card">
            <div className="goods-toolbar">
              <div className="card-title" style={{ marginBottom: 0 }}>Righe arrivo merci</div>
              <button className="btn ghost" onClick={addRow}>Aggiungi riga</button>
            </div>
            <div className="goods-grid">
              <div className="goods-row header">
                <div>SKU</div>
                <div>Nome</div>
                <div>Codice PL</div>
                <div>Qta</div>
                <div>Prezzo netto</div>
                <div>Sconto</div>
                <div>IVA</div>
                <div>Accisa</div>
                <div>Totale riga</div>
                <div>Nota riga</div>
                <div></div>
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="goods-row">
                  <input
                    value={row.sku}
                    onChange={(e) => updateRow(idx, { sku: e.target.value })}
                    onBlur={() => handleSkuBlur(idx)}
                  />
                  <input value={row.name} onChange={(e) => updateRow(idx, { name: e.target.value })} />
                  <input value={row.codicePl || ""} onChange={(e) => updateRow(idx, { codicePl: e.target.value })} />
                  <input
                    type="number"
                    value={row.qty}
                    onChange={(e) => updateRow(idx, { qty: Number(e.target.value || 0) })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(idx, { unitCost: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={row.discount || ""}
                    onChange={(e) => updateRow(idx, { discount: e.target.value })}
                    placeholder="%"
                  />
                  <select
                    value={row.taxRateId}
                    onChange={(e) => updateRow(idx, { taxRateId: e.target.value })}
                  >
                    <option value="">IVA</option>
                    {taxes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.exciseRateId}
                    onChange={(e) => updateRow(idx, { exciseRateId: e.target.value })}
                  >
                    <option value="">Accisa</option>
                    {excises.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <div>{money(Number(row.qty || 0) * Number(row.unitCost || 0))}</div>
                  <input
                    value={row.lineNote}
                    onChange={(e) => updateRow(idx, { lineNote: e.target.value })}
                    placeholder="Nota"
                  />
                  <button className="btn ghost small" onClick={() => removeRow(idx)}>Rimuovi</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="goods-side">
          <div className="order-summary-card order-card">
            <div className="card-title">Riepilogo</div>
            <div className="summary-grid">
              <div>
                <strong>Righe valide</strong>
                <div>{stats.lines}</div>
              </div>
              <div>
                <strong>Quantità totale</strong>
                <div>{stats.qty}</div>
              </div>
              <div>
                <strong>Valore a costo</strong>
                <div>{money(stats.cost)}</div>
              </div>
              <div>
                <strong>Subtotale (imponibile)</strong>
                <div>{money(stats.subtotal)}</div>
              </div>
              <div>
                <strong>Accise stimate</strong>
                <div>{money(stats.excise)}</div>
              </div>
              <div>
                <strong>IVA stimata</strong>
                <div>{money(stats.vat)}</div>
              </div>
              <div>
                <strong>Totale stimato</strong>
                <div>{money(stats.subtotal + stats.excise + stats.vat)}</div>
              </div>
            </div>
            <div className="summary-actions" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={saveReceipt} disabled={saving}>
                {saving ? "Salvataggio..." : "Conferma arrivo merci"}
              </button>
            </div>
          </div>

          <div className="order-card">
            <div className="card-title">Ultimi carichi</div>
            <div className="goods-receipts-list">
              {!receipts.length ? <div className="field-hint">Nessun arrivo merci registrato.</div> : null}
              {receipts.slice(0, 10).map((r) => (
                <div key={r.id} className="goods-receipt-item">
                  <div>
                    <strong>{r.receiptNo}</strong>
                    <div className="field-hint">{new Date(r.receivedAt).toLocaleDateString("it-IT")}</div>
                  </div>
                    <div className="goods-receipt-right">
                      <div className="field-hint">{r.linesCount} righe · {r.totalQty} pz</div>
                    <button className="btn ghost small" onClick={() => openEditReceipt(r.id)}>
                      Modifica
                    </button>
                    <button className="btn ghost small" onClick={() => setConfirmDelete(r)}>
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {confirmDelete ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>Conferma eliminazione</h3>
                </div>
                <button className="btn ghost" onClick={() => setConfirmDelete(null)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <p>
                  Eliminare il carico <strong>{confirmDelete.receiptNo}</strong>?<br />
                  Le giacenze inventario verranno aggiornate automaticamente.
                </p>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setConfirmDelete(null)}>
                    Annulla
                  </button>
                  <button className="btn danger" onClick={() => deleteReceipt(confirmDelete.id)}>
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
      {editingReceipt ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setEditingReceipt(null)}>
            <div className="modal returns-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>Modifica carico {editingReceipt.receiptNo}</h3>
                </div>
                <button className="btn ghost" onClick={() => setEditingReceipt(null)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <div className="order-form">
                  <div>
                    <label>Fornitore interno</label>
                    <input
                      value={editSupplierName}
                      onChange={(e) => setEditSupplierName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Riferimento</label>
                    <input value={editReference} onChange={(e) => setEditReference(e.target.value)} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label>Note</label>
                    <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </div>
                </div>
                <div className="goods-toolbar">
                  <div className="card-title" style={{ marginBottom: 0 }}>Righe carico</div>
                  <button className="btn ghost" onClick={addEditRow}>Aggiungi riga</button>
                </div>
                <div className="goods-grid">
                  <div className="goods-row header">
                    <div>SKU</div>
                    <div>Nome</div>
                    <div>Codice PL</div>
                    <div>Qta</div>
                    <div>Prezzo netto</div>
                    <div>Sconto</div>
                    <div>IVA</div>
                    <div>Accisa</div>
                    <div>Totale riga</div>
                    <div>Nota riga</div>
                    <div></div>
                  </div>
                  {editRows.map((row, idx) => (
                    <div key={idx} className="goods-row">
                      <input
                        value={row.sku}
                        onChange={(e) => updateEditRow(idx, { sku: e.target.value })}
                        onBlur={() => handleEditSkuBlur(idx)}
                      />
                      <input value={row.name} onChange={(e) => updateEditRow(idx, { name: e.target.value })} />
                      <input value={row.codicePl || ""} onChange={(e) => updateEditRow(idx, { codicePl: e.target.value })} />
                      <input type="number" value={row.qty} onChange={(e) => updateEditRow(idx, { qty: Number(e.target.value || 0) })} />
                      <input type="number" step="0.01" value={row.unitCost} onChange={(e) => updateEditRow(idx, { unitCost: e.target.value })} />
                      <input type="number" step="0.01" value={row.discount || ""} onChange={(e) => updateEditRow(idx, { discount: e.target.value })} placeholder="%" />
                      <select value={row.taxRateId} onChange={(e) => updateEditRow(idx, { taxRateId: e.target.value })}>
                        <option value="">IVA</option>
                        {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <select value={row.exciseRateId} onChange={(e) => updateEditRow(idx, { exciseRateId: e.target.value })}>
                        <option value="">Accisa</option>
                        {excises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <div>{money(Number(row.qty || 0) * Number(row.unitCost || 0))}</div>
                      <input value={row.lineNote} onChange={(e) => updateEditRow(idx, { lineNote: e.target.value })} placeholder="Nota" />
                      <button className="btn ghost small" onClick={() => removeEditRow(idx)}>Rimuovi</button>
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setEditingReceipt(null)}>Annulla</button>
                  <button className="btn primary" onClick={saveEditedReceipt} disabled={saving}>
                    {saving ? "Salvataggio..." : "Salva modifiche"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
      {conflictSkus.length ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => { setConflictSkus([]); setPendingImportRows([]); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>SKU già esistenti</h3>
                </div>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setConflictSkus([]);
                    setPendingImportRows([]);
                  }}
                >
                  Chiudi
                </button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <p>
                  Trovati <strong>{conflictSkus.length}</strong> SKU già presenti in inventario.
                  Vuoi aggiornare gli articoli esistenti o duplicare le voci importate?
                </p>
                <p className="field-hint">
                  Esempi: {conflictSkus.slice(0, 8).join(", ")}
                  {conflictSkus.length > 8 ? "..." : ""}
                </p>
                <div className="actions">
                  <button className="btn ghost" onClick={() => applyImportResolution("update")}>
                    Aggiorna inventario
                  </button>
                  <button className="btn primary" onClick={() => applyImportResolution("duplicate")}>
                    Duplica voci
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
