import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const newRow = () => ({
  sku: "",
  name: "",
  qty: 1,
  unitCost: "",
  unitPrice: "",
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
});

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

const CSV_HEADERS = [
  "sku",
  "name",
  "qty",
  "unitCost",
  "unitPrice",
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

  const parsedRows = useMemo(
    () => rows.filter((r) => r.sku.trim() && Number(r.qty || 0) > 0),
    [rows]
  );

  const stats = useMemo(() => {
    return parsedRows.reduce(
      (acc, row) => {
        const qty = Number(row.qty || 0);
        const unitCost = Number(row.unitCost || 0);
        const unitPrice = Number(row.unitPrice || 0);
        const ml = Number(row.mlProduct || 0);
        const tax = taxes.find((t) => t.id === row.taxRateId);
        const excise = excises.find((e) => e.id === row.exciseRateId);
        const exciseUnit = excise
          ? excise.type === "ML"
            ? Number(excise.amount || 0) * ml
            : Number(excise.amount || 0)
          : 0;
        const taxRate = Number(tax?.rate || 0);
        const vatUnit = taxRate > 0 ? (unitPrice + exciseUnit) * (taxRate / 100) : 0;
        acc.lines += 1;
        acc.qty += qty;
        acc.cost += qty * unitCost;
        acc.subtotal += qty * unitPrice;
        acc.excise += qty * exciseUnit;
        acc.vat += qty * vatUnit;
        return acc;
      },
      { lines: 0, qty: 0, cost: 0, subtotal: 0, excise: 0, vat: 0 }
    );
  }, [parsedRows, taxes, excises]);

  function updateRow(index, patch) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function applyPaste() {
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
        qty: Number(String(cols[2] || "1").replace(",", ".")) || 1,
        unitCost: String(cols[3] || "").trim(),
        unitPrice: String(cols[4] || "").trim(),
        brand: (cols[5] || "").trim(),
        category: (cols[6] || "").trim(),
        subcategory: (cols[7] || "").trim(),
        barcode: (cols[8] || "").trim(),
        nicotine: String(cols[9] || "").trim(),
        mlProduct: String(cols[10] || "").trim(),
        taxRateId: "",
        exciseRateId: "",
        lineNote: "",
        description: "",
        shortDescription: "",
      };
    });
    setRows(parsed);
    setPasteText("");
  }

  function downloadTemplateCsv() {
    const sample = [
      "SKU-001",
      "Prodotto esempio",
      "10",
      "3.50",
      "6.90",
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
        return {
          sku: String(cols[idx("sku")] || "").trim(),
          name: String(cols[idx("name")] || "").trim(),
          qty: Number(String(cols[idx("qty")] || "1").replace(",", ".")) || 1,
          unitCost: String(cols[idx("unitCost")] || "").trim(),
          unitPrice: String(cols[idx("unitPrice")] || "").trim(),
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

      setRows(parsed);
      setSuccess(`CSV importato: ${parsed.length} righe caricate.`);
    } catch {
      setError("Errore durante import CSV");
    }
  }

  function applyImportResolution(mode) {
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
    setRows(rowsToApply);
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
            unitPrice: r.unitPrice === "" ? null : Number(r.unitPrice),
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
            lineNote: r.lineNote || null,
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
          sku: line.sku || "",
          name: line.name || "",
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
            unitPrice: r.unitPrice === "" ? null : Number(r.unitPrice),
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
            lineNote: r.lineNote || null,
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
              Ordine colonne: SKU, Nome, Qta, Costo, Prezzo, Brand, Categoria, Sottocategoria, Barcode, Nicotina, ML
            </p>
            <textarea
              className="goods-paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="SKU123\tProdotto A\t12\t3.50\t7.90"
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
                <div>Qta</div>
                <div>Costo</div>
                <div>Prezzo</div>
                <div>Brand</div>
                <div>Categoria</div>
                <div>Nicotina</div>
                <div>ML</div>
                <div>IVA</div>
                <div>Accisa</div>
                <div>Nota riga</div>
                <div></div>
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="goods-row">
                  <input value={row.sku} onChange={(e) => updateRow(idx, { sku: e.target.value })} />
                  <input value={row.name} onChange={(e) => updateRow(idx, { name: e.target.value })} />
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
                    value={row.unitPrice}
                    onChange={(e) => updateRow(idx, { unitPrice: e.target.value })}
                  />
                  <input value={row.brand} onChange={(e) => updateRow(idx, { brand: e.target.value })} />
                  <input value={row.category} onChange={(e) => updateRow(idx, { category: e.target.value })} />
                  <input
                    type="number"
                    step="0.01"
                    value={row.nicotine}
                    onChange={(e) => updateRow(idx, { nicotine: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={row.mlProduct}
                    onChange={(e) => updateRow(idx, { mlProduct: e.target.value })}
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
                    <div>Qta</div>
                    <div>Costo</div>
                    <div>Prezzo</div>
                    <div>Brand</div>
                    <div>Categoria</div>
                    <div>Nicotina</div>
                    <div>ML</div>
                    <div>IVA</div>
                    <div>Accisa</div>
                    <div>Nota riga</div>
                    <div></div>
                  </div>
                  {editRows.map((row, idx) => (
                    <div key={idx} className="goods-row">
                      <input value={row.sku} onChange={(e) => updateEditRow(idx, { sku: e.target.value })} />
                      <input value={row.name} onChange={(e) => updateEditRow(idx, { name: e.target.value })} />
                      <input type="number" value={row.qty} onChange={(e) => updateEditRow(idx, { qty: Number(e.target.value || 0) })} />
                      <input type="number" step="0.01" value={row.unitCost} onChange={(e) => updateEditRow(idx, { unitCost: e.target.value })} />
                      <input type="number" step="0.01" value={row.unitPrice} onChange={(e) => updateEditRow(idx, { unitPrice: e.target.value })} />
                      <input value={row.brand} onChange={(e) => updateEditRow(idx, { brand: e.target.value })} />
                      <input value={row.category} onChange={(e) => updateEditRow(idx, { category: e.target.value })} />
                      <input type="number" step="0.01" value={row.nicotine} onChange={(e) => updateEditRow(idx, { nicotine: e.target.value })} />
                      <input type="number" step="0.01" value={row.mlProduct} onChange={(e) => updateEditRow(idx, { mlProduct: e.target.value })} />
                      <select value={row.taxRateId} onChange={(e) => updateEditRow(idx, { taxRateId: e.target.value })}>
                        <option value="">IVA</option>
                        {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <select value={row.exciseRateId} onChange={(e) => updateEditRow(idx, { exciseRateId: e.target.value })}>
                        <option value="">Accisa</option>
                        {excises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
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
