import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

export default function AdminTreasury() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((r) => [r.invoiceNo, r.counterparty, r.type, r.status].join(" ").toLowerCase().includes(key));
  }, [rows, q]);

  return (
    <section>
      <div className="page-header"><div><h1>Tesoreria</h1><p>Saldo fatture vendite e acquisti</p></div></div>
      <InlineError message={error} onClose={() => setError("")} />

      <div className="filters-row">
        <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="filter-group" style={{ minWidth: 320 }}><label>Ricerca</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fattura, tipo, cliente/fornitore" /></div>
      </div>

      <div className="table">
        <div className="row header"><div>Data</div><div>Tipo</div><div>N. fattura</div><div>Controparte</div><div>Totale</div><div>Stato</div><div>Azioni</div></div>
        {filtered.map((r) => (
          <div className="row" key={`${r.sourceType}-${r.sourceId}`}>
            <div>{new Date(r.date).toLocaleDateString("it-IT")}</div>
            <div>{r.type}</div>
            <div className="mono">{r.invoiceNo || "-"}</div>
            <div>{r.counterparty || "-"}</div>
            <div>{money(r.total)}</div>
            <div><span className={`tag ${r.paid ? "success" : "warn"}`}>{r.paid ? "Saldata" : "In attesa"}</span></div>
            <div><button className="btn ghost small" onClick={() => togglePaid(r)}>{r.paid ? "Segna non saldata" : "Segna saldata"}</button></div>
          </div>
        ))}
      </div>
    </section>
  );
}
