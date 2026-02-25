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

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((r) =>
      [r.invoiceNo, r.counterparty, r.sku, r.name, r.codicePl, r.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(key)
    );
  }, [rows, q]);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Movimenti Magazzino</h1>
          <p>Storico carichi/scarichi prodotti</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="filters-row">
        <div className="filter-group">
          <label>Data dal</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Data al</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="filter-group" style={{ minWidth: 320 }}>
          <label>Ricerca</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fattura, cliente/fornitore, SKU..." />
        </div>
        <div className="filter-group">
          <label>Tipo movimento</label>
          <select className="select" value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            <option value="">Tutti</option>
            <option value="CARICO">Solo carichi</option>
            <option value="SCARICO">Solo scarichi</option>
          </select>
        </div>
      </div>

      <div className="table">
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
    </section>
  );
}
