import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("it-IT") : "-");
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("it-IT") : "-");

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsvFile(filename, headers, dataRows) {
  const csv = [headers, ...dataRows].map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminTreasury() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterType, setFilterType] = useState("");
  const [filterCounterparty, setFilterCounterparty] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [detail, setDetail] = useState(null);
  const [depositDraft, setDepositDraft] = useState({ amount: "", date: "" });
  const [savingDeposit, setSavingDeposit] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      const res = await api(`/admin/treasury/invoices${params.toString() ? `?${params.toString()}` : ""}`);
      setRows(res || []);
    } catch {
      setError("Impossibile caricare tesoreria");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate]);

  async function togglePaid(row) {
    try {
      await api(`/admin/treasury/mark-paid`, {
        method: "PATCH",
        body: JSON.stringify({ sourceType: row.sourceType, sourceId: row.sourceId, paid: !row.paid }),
      });
      load();
    } catch {
      setError("Impossibile aggiornare stato saldo");
    }
  }

  async function batchMarkPaid() {
    if (!selectedIds.size) return;
    try {
      const promises = filtered
        .filter((r) => selectedIds.has(`${r.sourceType}-${r.sourceId}`) && !r.paid)
        .map((r) =>
          api("/admin/treasury/mark-paid", {
            method: "PATCH",
            body: JSON.stringify({ sourceType: r.sourceType, sourceId: r.sourceId, paid: true }),
          })
        );
      await Promise.all(promises);
      setSelectedIds(new Set());
      load();
    } catch {
      setError("Impossibile aggiornare stato saldo");
    }
  }

  async function saveDeposit() {
    if (!detail || !depositDraft.amount) return;
    setSavingDeposit(true);
    try {
      await api("/admin/treasury/deposit", {
        method: "POST",
        body: JSON.stringify({
          sourceType: detail.sourceType,
          sourceId: detail.sourceId,
          amount: Number(depositDraft.amount),
          date: depositDraft.date || new Date().toISOString().slice(0, 10),
        }),
      });
      setDepositDraft({ amount: "", date: "" });
      await load();
      const updated = (await api("/admin/treasury/invoices")) || [];
      const match = updated.find((r) => r.sourceId === detail.sourceId && r.sourceType === detail.sourceType);
      if (match) setDetail(match);
    } catch {
      setError("Impossibile salvare acconto");
    } finally {
      setSavingDeposit(false);
    }
  }

  const typeOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.type).filter(Boolean))).sort(), [rows]);
  const counterpartyOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.counterparty).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")), [rows]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (key && ![r.invoiceNo, r.counterparty, r.type, r.paid ? "saldata" : "in attesa"].join(" ").toLowerCase().includes(key)) return false;
      if (filterType && r.type !== filterType) return false;
      if (filterCounterparty && r.counterparty !== filterCounterparty) return false;
      if (filterStatus === "paid" && !r.paid) return false;
      if (filterStatus === "pending" && r.paid) return false;
      return true;
    });
  }, [rows, q, filterType, filterCounterparty, filterStatus]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortField === "total") cmp = Number(a.total || 0) - Number(b.total || 0);
      else if (sortField === "counterparty") cmp = String(a.counterparty || "").localeCompare(String(b.counterparty || ""), "it");
      else if (sortField === "type") cmp = String(a.type || "").localeCompare(String(b.type || ""), "it");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.total += Number(r.total || 0);
          if (r.paid) acc.paid += Number(r.total || 0);
          else acc.pending += Number(r.total || 0);
          return acc;
        },
        { total: 0, paid: 0, pending: 0 }
      ),
    [filtered]
  );

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function sortIcon(field) {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function doExport() {
    exportCsvFile(
      "tesoreria.csv",
      ["Data", "Tipo", "N. fattura", "Controparte", "Totale", "Stato", "Saldato il"],
      sorted.map((r) => [
        fmtDate(r.date),
        r.type || "",
        r.invoiceNo || "",
        r.counterparty || "",
        Number(r.total || 0).toFixed(2),
        r.paid ? "Saldata" : "In attesa",
        r.paidAt ? fmtDateTime(r.paidAt) : "",
      ])
    );
  }

  function doPrint() {
    const bodyRows = sorted
      .map(
        (r) =>
          `<tr><td>${fmtDate(r.date)}</td><td>${r.type || "-"}</td><td>${r.invoiceNo || "-"}</td><td>${r.counterparty || "-"}</td><td style="text-align:right">${money(r.total)}</td><td>${r.paid ? "Saldata" : "In attesa"}</td></tr>`
      )
      .join("");
    const w = window.open("", "_blank", "width=1000,height=700");
    if (!w) { setError("Popup bloccato"); return; }
    w.document.write(`<html><head><title>Tesoreria</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;font-size:13px;text-align:left}th{background:#f8fafc}</style></head><body><h1>Tesoreria</h1><table><thead><tr><th>Data</th><th>Tipo</th><th>N. fattura</th><th>Controparte</th><th>Totale</th><th>Stato</th></tr></thead><tbody>${bodyRows}</tbody></table><script>window.onload=()=>{window.print();window.close();};<\/script></body></html>`);
    w.document.close();
  }

  const allVisibleIds = sorted.map((r) => `${r.sourceType}-${r.sourceId}`);

  return (
    <section className="treasury-page">
      <div className="page-header"><div><h1>Tesoreria</h1><p>Saldo fatture vendite e acquisti</p></div></div>
      <InlineError message={error} onClose={() => setError("")} />

      <div className="treasury-filters-shell">
        <div className="treasury-filters-top">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fattura, tipo, cliente/fornitore" />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
          <button className="btn ghost" onClick={() => { setStartDate(""); setEndDate(""); setQ(""); setFilterType(""); setFilterCounterparty(""); setFilterStatus(""); }}>
            Reset filtri
          </button>
        </div>
        <div className="filters-row treasury-filters-grid">
          <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="filter-group">
            <label>Tipo</label>
            <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tutti</option>
              {typeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Controparte</label>
            <select className="select" value={filterCounterparty} onChange={(e) => setFilterCounterparty(e.target.value)}>
              <option value="">Tutte</option>
              {counterpartyOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Stato</label>
            <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Tutti</option>
              <option value="paid">Saldata</option>
              <option value="pending">In attesa</option>
            </select>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={doExport}>Esporta CSV</button>
            <button className="btn ghost" onClick={doPrint}>Stampa elenco</button>
            {selectedIds.size > 0 && (
              <button className="btn primary" onClick={batchMarkPaid}>
                Segna saldato ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="cards treasury-cards">
        <div className="card"><div className="card-label">Documenti</div><div className="card-value">{filtered.length}</div></div>
        <div className="card"><div className="card-label">Totale</div><div className="card-value">{money(totals.total)}</div></div>
        <div className="card"><div className="card-label">Saldato</div><div className="card-value">{money(totals.paid)}</div></div>
        <div className="card"><div className="card-label">In attesa</div><div className="card-value">{money(totals.pending)}</div></div>
      </div>

      {viewMode === "table" ? (
        <div className="table treasury-table-pro">
          <div className="row header">
            <div><input type="checkbox" checked={allVisibleIds.length > 0 && selectedIds.size === allVisibleIds.length} onChange={(e) => setSelectedIds(e.target.checked ? new Set(allVisibleIds) : new Set())} /></div>
            <div style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>Data {sortIcon("date")}</div>
            <div style={{ cursor: "pointer" }} onClick={() => toggleSort("type")}>Tipo {sortIcon("type")}</div>
            <div>N. fattura</div>
            <div style={{ cursor: "pointer" }} onClick={() => toggleSort("counterparty")}>Controparte {sortIcon("counterparty")}</div>
            <div style={{ cursor: "pointer" }} onClick={() => toggleSort("total")}>Totale {sortIcon("total")}</div>
            <div>Stato</div>
            <div>Saldato il</div>
            <div>Azioni</div>
          </div>
          {sorted.map((r) => {
            const key = `${r.sourceType}-${r.sourceId}`;
            return (
              <div className="row" key={key} onClick={() => setDetail(r)} style={{ cursor: "pointer" }}>
                <div onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(key)} onChange={(e) => setSelectedIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(key); else next.delete(key); return next; })} />
                </div>
                <div>{fmtDate(r.date)}</div>
                <div>{r.type}</div>
                <div className="mono">{r.invoiceNo || "-"}</div>
                <div>{r.counterparty || "-"}</div>
                <div>{money(r.total)}</div>
                <div><span className={`tag ${r.paid ? "success" : "warn"}`}>{r.paid ? "Saldata" : "In attesa"}</span></div>
                <div>{r.paidAt ? fmtDateTime(r.paidAt) : "-"}</div>
                <div onClick={(e) => e.stopPropagation()}>
                  <button className="btn ghost small" onClick={() => togglePaid(r)}>{r.paid ? "Non saldata" : "Saldata"}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="treasury-cards-grid">
          {sorted.map((r) => (
            <article key={`${r.sourceType}-${r.sourceId}`} className="treasury-card" onClick={() => setDetail(r)} style={{ cursor: "pointer" }}>
              <div className="treasury-card-top">
                <strong className="mono">{r.invoiceNo || "-"}</strong>
                <span className={`tag ${r.paid ? "success" : "warn"}`}>{r.paid ? "Saldata" : "In attesa"}</span>
              </div>
              <strong>{r.counterparty || "-"}</strong>
              <div className="muted">{fmtDate(r.date)} · {r.type}</div>
              <div className="treasury-card-total">{money(r.total)}</div>
              {r.paidAt && <div className="muted">Saldato il: {fmtDateTime(r.paidAt)}</div>}
              <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); togglePaid(r); }}>
                {r.paid ? "Segna non saldata" : "Segna saldata"}
              </button>
            </article>
          ))}
        </div>
      )}

      {detail && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <div className="modal-title"><h3>Dettaglio documento</h3></div>
                <button className="btn ghost" onClick={() => setDetail(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="summary-grid">
                  <div><strong>Tipo</strong><div>{detail.type}</div></div>
                  <div><strong>N. fattura</strong><div>{detail.invoiceNo || "-"}</div></div>
                  <div><strong>Controparte</strong><div>{detail.counterparty || "-"}</div></div>
                  <div><strong>Data</strong><div>{fmtDate(detail.date)}</div></div>
                  <div><strong>Totale</strong><div>{money(detail.total)}</div></div>
                  <div><strong>Stato</strong><div><span className={`tag ${detail.paid ? "success" : "warn"}`}>{detail.paid ? "Saldata" : "In attesa"}</span></div></div>
                  {detail.paidAt && <div><strong>Saldato il</strong><div>{fmtDateTime(detail.paidAt)}</div></div>}
                  {detail.deposits?.length > 0 && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <strong>Acconti</strong>
                      <div>
                        {detail.deposits.map((d, i) => (
                          <div key={i} className="muted">{fmtDate(d.date)} — {money(d.amount)}</div>
                        ))}
                        <div style={{ marginTop: 4 }}>
                          <strong>Totale acconti: {money(detail.deposits.reduce((s, d) => s + Number(d.amount || 0), 0))}</strong>
                          {" · "}
                          <strong>Rimanente: {money(Number(detail.total || 0) - detail.deposits.reduce((s, d) => s + Number(d.amount || 0), 0))}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {!detail.paid && (
                  <div className="form-grid" style={{ marginTop: 16 }}>
                    <label>Acconto importo
                      <input type="number" step="0.01" value={depositDraft.amount} onChange={(e) => setDepositDraft((p) => ({ ...p, amount: e.target.value }))} placeholder="€" />
                    </label>
                    <label>Data acconto
                      <input type="date" value={depositDraft.date} onChange={(e) => setDepositDraft((p) => ({ ...p, date: e.target.value }))} />
                    </label>
                    <div className="actions">
                      <button className="btn primary" onClick={saveDeposit} disabled={savingDeposit || !depositDraft.amount}>
                        {savingDeposit ? "Salvataggio..." : "Registra acconto"}
                      </button>
                    </div>
                  </div>
                )}
                <div className="actions" style={{ marginTop: 16 }}>
                  <button className="btn ghost" onClick={() => togglePaid(detail)}>
                    {detail.paid ? "Segna non saldata" : "Segna saldata"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}
