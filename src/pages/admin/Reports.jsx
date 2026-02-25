import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

// CHECKLIST (admin richieste):
// [x] Accisa prima di IVA
// [x] Ricerca scrivibile cliente/prodotto (input testuale + select filtrata)
// [x] Margine rinominato "netto-costo"
// [x] Numero ordine reale in dettaglio vendite

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(v) {
  return `€ ${Number(v || 0).toFixed(2)}`;
}

export default function AdminReports() {
  const defaultRange = useMemo(() => {
    const now = new Date();
    return { start: now, end: now };
  }, []);
  const [startDate, setStartDate] = useState(toDateInput(defaultRange.start));
  const [endDate, setEndDate] = useState(toDateInput(defaultRange.end));
  const [companyId, setCompanyId] = useState("");
  const [productId, setProductId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [data, setData] = useState({
    totals: {
      rows: 0,
      orders: 0,
      qty: 0,
      revenueNet: 0,
      revenueGross: 0,
      vat: 0,
      excise: 0,
      cost: 0,
      margin: 0,
    },
    topProducts: [],
    topClients: [],
    lines: [],
    pagination: { page: 1, perPage: 150, total: 0, totalPages: 1 },
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        page: "1",
        perPage: "150",
      });
      if (companyId) params.set("companyId", companyId);
      if (productId) params.set("productId", productId);
      const res = await api(`/admin/reports?${params.toString()}`);
      setData(res);
    } catch {
      setError("Impossibile caricare report");
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    const token = getToken();
    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
    });
    if (companyId) params.set("companyId", companyId);
    if (productId) params.set("productId", productId);
    const res = await fetch(`/api/admin/reports/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error("Export fallito");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_vendite_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return (companies || []).filter((c) =>
      [c.name, c.legalName, c.email, c.vatNumber].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [companies, companyQuery]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return (products || []).filter((p) =>
      [p.sku, p.name].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [products, productQuery]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [companyRes, productRes] = await Promise.all([api("/admin/companies"), api("/admin/products")]);
        if (!active) return;
        setCompanies(companyRes || []);
        setProducts(productRes || []);
      } catch {
        if (!active) return;
        setCompanies([]);
        setProducts([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Report</h1>
          <p>Storico vendite per controlli fiscali, cliente e prodotto</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <label>
            Da
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            A
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label>
            Cerca cliente
            <input
              type="text"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              placeholder="Nome, email o P.IVA"
            />
          </label>
          <label>
            Cliente
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {filteredCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Cerca prodotto
            <input
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="SKU o nome prodotto"
            />
          </label>
          <label>
            Prodotto (SKU)
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Tutti i prodotti</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" onClick={load} disabled={loading}>
            {loading ? "Carico..." : "Aggiorna"}
          </button>
        </div>
        <div className="analytics-export">
          <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="cards analytics-cards">
        <div className="card"><div className="card-label">Righe vendita</div><div className="card-value">{data.totals.rows}</div><div className="card-sub">Movimenti nel periodo</div></div>
        <div className="card"><div className="card-label">Ordini</div><div className="card-value">{data.totals.orders}</div><div className="card-sub">Univoci</div></div>
        <div className="card"><div className="card-label">Pezzi</div><div className="card-value">{data.totals.qty}</div><div className="card-sub">Totale quantità</div></div>
        <div className="card"><div className="card-label">Totale imponibile</div><div className="card-value">{formatMoney(data.totals.revenueNet)}</div><div className="card-sub">Netto</div></div>
        <div className="card"><div className="card-label">Accise</div><div className="card-value">{formatMoney(data.totals.excise)}</div><div className="card-sub">Nel periodo</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{formatMoney(data.totals.vat)}</div><div className="card-sub">Nel periodo</div></div>
        <div className="card"><div className="card-label">Totale lordo</div><div className="card-value">{formatMoney(data.totals.revenueGross)}</div><div className="card-sub">Imponibile + IVA + accise</div></div>
        <div className="card"><div className="card-label">Margine netto-costo</div><div className="card-value">{formatMoney(data.totals.margin)}</div><div className="card-sub">Imponibile - costo prodotti</div></div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header"><div><h2>Top prodotti</h2><div className="muted">Per totale lordo</div></div></div>
          <div className="table compact">
            <div className="row header"><div>Prodotto</div><div>Pezzi</div><div>Totale</div></div>
            {data.topProducts.map((p) => (
              <div className="row" key={p.id}>
                <div>{p.sku} · {p.name}</div>
                <div>{p.qty}</div>
                <div>{formatMoney(p.revenueGross)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header"><div><h2>Top clienti</h2><div className="muted">Per totale lordo</div></div></div>
          <div className="table compact">
            <div className="row header"><div>Cliente</div><div>Ordini</div><div>Totale</div></div>
            {data.topClients.map((c) => (
              <div className="row" key={c.id}>
                <div>{c.name}</div>
                <div>{c.orders}</div>
                <div>{formatMoney(c.revenueGross)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Dettaglio vendite</h2>
            <div className="muted">
              Righe: {data.pagination.total} · Pagina {data.pagination.page}/{data.pagination.totalPages}
            </div>
          </div>
        </div>
        <div className="table wide-report">
          <div className="row header">
            <div>Data</div>
            <div>Ordine</div>
            <div>Cliente</div>
            <div>SKU</div>
            <div>Prodotto</div>
            <div>Q.tà</div>
            <div>Imponibile</div>
            <div>Accisa</div>
            <div>IVA</div>
            <div>Totale lordo</div>
          </div>
          {data.lines.map((r) => (
            <div className="row" key={r.id}>
              <div>{new Date(r.createdAt).toLocaleDateString("it-IT")}</div>
              <div className="mono">{r.orderNumber || r.orderId.slice(-8).toUpperCase()}</div>
              <div>{r.companyName}</div>
              <div className="mono">{r.sku}</div>
              <div>{r.productName}</div>
              <div>{r.qty}</div>
              <div>{formatMoney(r.lineNet)}</div>
              <div>{formatMoney(r.excise)}</div>
              <div>{formatMoney(r.vat)}</div>
              <div>{formatMoney(r.lineGross)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
