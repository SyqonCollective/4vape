import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

export default function AdminExpenses() {
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [draft, setDraft] = useState({
    invoiceNo: "",
    expenseDate: "",
    supplier: "",
    category: "",
    amountNet: "",
    taxRateId: "",
    vat: "",
    total: "",
    notes: "",
  });

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      if (supplierFilter) params.set("supplier", supplierFilter);
      const res = await api(`/admin/expenses${params.toString() ? `?${params.toString()}` : ""}`);
      setRows(res || []);
    } catch {
      setError("Impossibile caricare spese");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate, supplierFilter]);

  useEffect(() => {
    (async () => {
      try {
        const [sup, tax] = await Promise.all([api("/admin/suppliers"), api("/admin/taxes")]);
        setSuppliers(sup || []);
        setTaxes(tax || []);
      } catch {
        setSuppliers([]);
        setTaxes([]);
      }
    })();
  }, []);

  useEffect(() => {
    const imponibile = Number(draft.amountNet || 0);
    const selectedTax = taxes.find((t) => t.id === draft.taxRateId);
    const rate = Number(selectedTax?.rate || 0);
    const vat = draft.taxRateId ? imponibile * (rate / 100) : Number(draft.vat || 0);
    const total = imponibile + vat;
    setDraft((prev) => ({
      ...prev,
      vat: Number.isFinite(vat) ? vat.toFixed(2) : prev.vat,
      total: Number.isFinite(total) ? total.toFixed(2) : prev.total,
    }));
  }, [draft.amountNet, draft.taxRateId, taxes]);

  async function createExpense() {
    try {
      await api("/admin/expenses", {
        method: "POST",
        body: JSON.stringify({
          invoiceNo: draft.invoiceNo,
          expenseDate: draft.expenseDate,
          supplier: draft.supplier,
          category: draft.category,
          amountNet: Number(draft.amountNet || 0),
          vat: Number(draft.vat || 0),
          notes: draft.notes,
        }),
      });
      setDraft({
        invoiceNo: "",
        expenseDate: "",
        supplier: "",
        category: "",
        amountNet: "",
        taxRateId: "",
        vat: "",
        total: "",
        notes: "",
      });
      load();
    } catch {
      setError("Impossibile salvare fattura spesa");
    }
  }

  const filteredRows = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((r) =>
      `${r.invoiceNo || ""} ${r.supplier || ""} ${r.category || ""} ${r.notes || ""}`
        .toLowerCase()
        .includes(key)
    );
  }, [rows, query]);

  const totals = useMemo(() => filteredRows.reduce((acc, r) => {
    acc.net += Number(r.amountNet || 0);
    acc.vat += Number(r.vat || 0);
    acc.total += Number(r.total || 0);
    return acc;
  }, { net: 0, vat: 0, total: 0 }), [filteredRows]);

  return (
    <section className="expenses-page">
      <div className="page-header"><div><h1>Registro fatture spese</h1><p>Corrente, internet, affitto e altre spese aziendali</p></div></div>
      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards">
        <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(totals.net)}</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{money(totals.vat)}</div></div>
        <div className="card"><div className="card-label">Totale spese</div><div className="card-value">{money(totals.total)}</div></div>
      </div>

      <div className="panel form-grid expenses-form-panel">
        <label>Numero fattura<input value={draft.invoiceNo} onChange={(e) => setDraft({ ...draft, invoiceNo: e.target.value })} /></label>
        <label>Data fattura<input type="date" value={draft.expenseDate} onChange={(e) => setDraft({ ...draft, expenseDate: e.target.value })} /></label>
        <label>
          Fornitore
          <select
            className="select"
            value={draft.supplier}
            onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
          >
            <option value="">Seleziona fornitore</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>Categoria<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="es. Affitto" /></label>
        <label>Imponibile<input type="number" step="0.01" value={draft.amountNet} onChange={(e) => setDraft({ ...draft, amountNet: e.target.value })} /></label>
        <label>
          IVA (aliquota)
          <select className="select" value={draft.taxRateId} onChange={(e) => setDraft({ ...draft, taxRateId: e.target.value })}>
            <option value="">Manuale</option>
            {taxes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({Number(t.rate || 0).toFixed(2)}%)
              </option>
            ))}
          </select>
        </label>
        <label>IVA (importo)<input type="number" step="0.01" value={draft.vat} onChange={(e) => setDraft({ ...draft, vat: e.target.value, taxRateId: "" })} /></label>
        <label>Totale fattura<input type="number" step="0.01" value={draft.total} readOnly /></label>
        <label className="full">Note<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        <div className="actions"><button className="btn primary" onClick={createExpense}>Registra spesa</button></div>
      </div>

      <div className="expenses-filters-shell">
        <div className="expenses-filters-top">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca numero, fornitore, categoria..." />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setSupplierFilter("");
              setQuery("");
            }}
          >
            Reset filtri
          </button>
        </div>
      <div className="filters-row expenses-filters-grid">
        <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="filter-group">
          <label>Fornitore</label>
          <select className="select" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">Tutti</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      </div>

      {viewMode === "table" ? (
      <div className="table expenses-table-pro">
        <div className="row header"><div>Data</div><div>N. fattura</div><div>Fornitore</div><div>Categoria</div><div>Imponibile</div><div>IVA</div><div>Totale</div></div>
        {filteredRows.map((r) => (
          <div className="row" key={r.id}>
            <div>{new Date(r.expenseDate).toLocaleDateString("it-IT")}</div>
            <div className="mono">{r.invoiceNo}</div>
            <div>{r.supplier || "-"}</div>
            <div>{r.category || "-"}</div>
            <div>{money(r.amountNet)}</div>
            <div>{money(r.vat)}</div>
            <div>{money(r.total)}</div>
          </div>
        ))}
      </div>
      ) : (
        <div className="expenses-cards-grid">
          {filteredRows.map((r) => (
            <article key={r.id} className="expenses-card">
              <div className="expenses-card-top">
                <strong className="mono">{r.invoiceNo}</strong>
                <span>{new Date(r.expenseDate).toLocaleDateString("it-IT")}</span>
              </div>
              <strong>{r.supplier || "-"}</strong>
              <div className="muted">{r.category || "-"}</div>
              <div className="expenses-card-grid">
                <span>Imponibile: <strong>{money(r.amountNet)}</strong></span>
                <span>IVA: <strong>{money(r.vat)}</strong></span>
                <span>Totale: <strong>{money(r.total)}</strong></span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
