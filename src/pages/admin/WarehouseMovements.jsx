import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminWarehouseMovements() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [q, setQ] = useState("");
  const [movementType, setMovementType] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [filterCounterparty, setFilterCounterparty] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterMl, setFilterMl] = useState("");
  const [filterExcise, setFilterExcise] = useState("");

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      if (movementType) params.set("movementType", movementType);
      const res = await api(`/admin/inventory/movements${params.toString() ? `?${params.toString()}` : ""}`);
      setRows(res || []);
    } catch {
      setError("Impossibile caricare movimenti magazzino");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate, movementType]);

  const counterpartyOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.counterparty).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")), [rows]);
  const skuOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.sku).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")), [rows]);
  const nameOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")), [rows]);
  const mlOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.mlProduct != null ? String(r.mlProduct) : null).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [rows]);
  const exciseOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.excise).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")), [rows]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (key && ![r.invoiceNo, r.counterparty, r.sku, r.name, r.codicePl, r.type].filter(Boolean).join(" ").toLowerCase().includes(key)) return false;
      if (filterCounterparty && r.counterparty !== filterCounterparty) return false;
      if (filterSku && r.sku !== filterSku) return false;
      if (filterName && r.name !== filterName) return false;
      if (filterMl && String(r.mlProduct) !== filterMl) return false;
      if (filterExcise && r.excise !== filterExcise) return false;
      return true;
    });
  }, [rows, q, filterCounterparty, filterSku, filterName, filterMl, filterExcise]);

  const stats = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.rows += 1;
        acc.load += Number(r.loadQty || 0);
        acc.unload += Number(r.unloadQty || 0);
        if (r.type === "CARICO") acc.loadDocs += 1;
        if (r.type === "SCARICO") acc.unloadDocs += 1;
        return acc;
      },
      { rows: 0, load: 0, unload: 0, loadDocs: 0, unloadDocs: 0 }
    );
  }, [filtered]);

  return (
    <section className="warehouse-page">
      <div className="page-header">
        <div>
          <h1>Movimenti Magazzino</h1>
          <p>Storico carichi/scarichi prodotti</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="warehouse-filters-shell">
        <div className="warehouse-filters-top">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fattura, cliente/fornitore, SKU..." />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setQ("");
              setMovementType("");
              setFilterCounterparty("");
              setFilterSku("");
              setFilterName("");
              setFilterMl("");
              setFilterExcise("");
            }}
          >
            Reset filtri
          </button>
        </div>
      <div className="filters-row warehouse-filters-grid">
        <div className="filter-group">
          <label>Data dal</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Data al</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="filter-group" style={{ minWidth: 320 }}>
          <label>Righe</label>
          <input value={stats.rows} readOnly />
        </div>
        <div className="filter-group">
          <label>Tipo movimento</label>
          <select className="select" value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            <option value="">Tutti</option>
            <option value="CARICO">Solo carichi</option>
            <option value="SCARICO">Solo scarichi</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Cliente/Fornitore</label>
          <select className="select" value={filterCounterparty} onChange={(e) => setFilterCounterparty(e.target.value)}>
            <option value="">Tutti</option>
            {counterpartyOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>SKU</label>
          <select className="select" value={filterSku} onChange={(e) => setFilterSku(e.target.value)}>
            <option value="">Tutti</option>
            {skuOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Nome prodotto</label>
          <select className="select" value={filterName} onChange={(e) => setFilterName(e.target.value)}>
            <option value="">Tutti</option>
            {nameOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>ML prodotto</label>
          <select className="select" value={filterMl} onChange={(e) => setFilterMl(e.target.value)}>
            <option value="">Tutti</option>
            {mlOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Accisa</label>
          <select className="select" value={filterExcise} onChange={(e) => setFilterExcise(e.target.value)}>
            <option value="">Tutte</option>
            {exciseOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      </div>

      <div className="cards warehouse-cards">
        <div className="card"><div className="card-label">Movimenti</div><div className="card-value">{stats.rows}</div></div>
        <div className="card"><div className="card-label">Q.tà carico</div><div className="card-value">{stats.load}</div></div>
        <div className="card"><div className="card-label">Q.tà scarico</div><div className="card-value">{stats.unload}</div></div>
        <div className="card"><div className="card-label">Documenti carico</div><div className="card-value">{stats.loadDocs}</div></div>
        <div className="card"><div className="card-label">Documenti scarico</div><div className="card-value">{stats.unloadDocs}</div></div>
      </div>

      {viewMode === "table" ? (
      <div className="table warehouse-table-pro">
        <div className="row header">
          <div>Data</div>
          <div>N. fattura</div>
          <div>Cliente/Fornitore</div>
          <div>SKU</div>
          <div>Nome prodotto</div>
          <div>Carico</div>
          <div>Scarico</div>
          <div>Codice PL</div>
          <div>ML prodotto</div>
          <div>Accisa</div>
        </div>
        {filtered.map((r, i) => (
          <div className="row" key={`${r.type}-${r.invoiceNo}-${r.sku}-${i}`}>
            <div>{new Date(r.date).toLocaleDateString("it-IT")}</div>
            <div className="mono">{r.invoiceNo || "-"}</div>
            <div>{r.counterparty || "-"}</div>
            <div className="mono">{r.sku}</div>
            <div>{r.name}</div>
            <div>{r.loadQty == null || Number(r.loadQty) === 0 ? "" : r.loadQty}</div>
            <div>{r.unloadQty == null || Number(r.unloadQty) === 0 ? "" : r.unloadQty}</div>
            <div className="mono">{r.codicePl || "-"}</div>
            <div>{r.mlProduct ?? "-"}</div>
            <div>{r.excise || "-"}</div>
          </div>
        ))}
      </div>
      ) : (
        <div className="warehouse-cards-grid">
          {filtered.map((r, i) => (
            <article key={`${r.type}-${r.invoiceNo}-${r.sku}-${i}`} className="warehouse-card">
              <div className="warehouse-card-top">
                <strong className="mono">{r.invoiceNo || "-"}</strong>
                <span className={`tag ${r.type === "CARICO" ? "success" : "warn"}`}>{r.type}</span>
              </div>
              <strong>{r.name}</strong>
              <div className="muted">{r.counterparty || "-"}</div>
              <div className="warehouse-card-grid">
                <span>SKU: <strong className="mono">{r.sku}</strong></span>
                <span>Data: <strong>{new Date(r.date).toLocaleDateString("it-IT")}</strong></span>
                <span>Carico: <strong>{r.loadQty == null || Number(r.loadQty) === 0 ? "-" : r.loadQty}</strong></span>
                <span>Scarico: <strong>{r.unloadQty == null || Number(r.unloadQty) === 0 ? "-" : r.unloadQty}</strong></span>
                <span>PL: <strong>{r.codicePl || "-"}</strong></span>
                <span>ML: <strong>{r.mlProduct ?? "-"}</strong></span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
