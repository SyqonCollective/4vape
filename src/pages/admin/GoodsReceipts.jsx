import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

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
});

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

export default function AdminGoodsReceipts() {
  const [rows, setRows] = useState([newRow(), newRow(), newRow()]);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receipts, setReceipts] = useState([]);

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
        const [taxRes, exciseRes] = await Promise.all([api("/admin/taxes"), api("/admin/excises")]);
        setTaxes(taxRes || []);
        setExcises(exciseRes || []);
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
        description: "",
        shortDescription: "",
      };
    });
    setRows(parsed);
    setPasteText("");
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
                <label>Note</label>
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
              <button className="btn ghost" onClick={applyPaste}>Applica incolla</button>
            </div>
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
                  <div className="field-hint">{r.linesCount} righe · {r.totalQty} pz</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
