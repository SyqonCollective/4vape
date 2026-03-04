import { useEffect, useMemo, useState } from "react";
import { api, getAuthToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

// CHECKLIST (admin richieste):
// [x] Accisa prima di IVA
// [x] Ricerca scrivibile cliente/prodotto (input testuale + select filtrata)
// [x] Margine rinominato "netto-costo"
// [x] Numero ordine reale in dettaglio vendite

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function rangeDays(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start, end };
}

function formatMoney(v) {
  return `€ ${Number(v || 0).toFixed(2)}`;
}

function formatDateIT(v) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminReports() {
  const defaultRange = useMemo(() => {
    const r = rangeDays(30);
    return { start: r.start, end: r.end };
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
  const [activeTab, setActiveTab] = useState("overview");
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

  async function load(overrides) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: overrides?.start || startDate,
        end: overrides?.end || endDate,
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
    const token = await getAuthToken();
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
    <section className="reports-modern">
      <div className="page-header">
        <div>
          <h1>Report</h1>
          <p>Controllo vendite, marginalità e storico fiscale</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="rpt-toolbar">
        <div className="rpt-filters">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Data dal" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Data al" />
          <input
            type="text"
            value={companyQuery}
            onChange={(e) => setCompanyQuery(e.target.value)}
            placeholder="Cerca cliente..."
          />
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Tutti i clienti</option>
            {filteredCompanies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Cerca prodotto..."
          />
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Tutti i prodotti</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
            ))}
          </select>
          <button className="btn primary small" onClick={load} disabled={loading}>
            {loading ? "..." : "Aggiorna"}
          </button>
        </div>
        <div className="rpt-actions">
          <div className="rpt-quick">
            <button className="btn ghost small" onClick={() => {
              const r = rangeDays(7);
              const s = toDateInput(r.start), e = toDateInput(r.end);
              setStartDate(s);
              setEndDate(e);
              load({ start: s, end: e });
            }}>7g</button>
            <button className="btn ghost small" onClick={() => {
              const r = rangeDays(30);
              const s = toDateInput(r.start), e = toDateInput(r.end);
              setStartDate(s);
              setEndDate(e);
              load({ start: s, end: e });
            }}>30g</button>
            <button className="btn ghost small" onClick={() => {
              const r = rangeDays(90);
              const s = toDateInput(r.start), e = toDateInput(r.end);
              setStartDate(s);
              setEndDate(e);
              load({ start: s, end: e });
            }}>90g</button>
          </div>
          <button className="btn ghost small" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="rpt-kpis">
        <div className="rpt-kpi"><span className="rpt-kpi-val">{data.totals.rows}</span><span className="rpt-kpi-lbl">Righe</span></div>
        <div className="rpt-kpi"><span className="rpt-kpi-val">{data.totals.orders}</span><span className="rpt-kpi-lbl">Ordini</span></div>
        <div className="rpt-kpi"><span className="rpt-kpi-val">{data.totals.qty}</span><span className="rpt-kpi-lbl">Pezzi</span></div>
        <div className="rpt-kpi rpt-kpi-accent"><span className="rpt-kpi-val">{formatMoney(data.totals.revenueNet)}</span><span className="rpt-kpi-lbl">Imponibile</span></div>
        <div className="rpt-kpi"><span className="rpt-kpi-val">{formatMoney(data.totals.excise)}</span><span className="rpt-kpi-lbl">Accise</span></div>
        <div className="rpt-kpi"><span className="rpt-kpi-val">{formatMoney(data.totals.vat)}</span><span className="rpt-kpi-lbl">IVA</span></div>
        <div className="rpt-kpi rpt-kpi-accent"><span className="rpt-kpi-val">{formatMoney(data.totals.revenueGross)}</span><span className="rpt-kpi-lbl">Lordo</span></div>
        <div className="rpt-kpi"><span className="rpt-kpi-val">{formatMoney(data.totals.margin)}</span><span className="rpt-kpi-lbl">Margine</span></div>
      </div>

      <div className="rpt-tabs">
        <button type="button" className={`rpt-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>Overview</button>
        <button type="button" className={`rpt-tab ${activeTab === "details" ? "active" : ""}`} onClick={() => setActiveTab("details")}>Dettaglio vendite</button>
      </div>

      {activeTab === "overview" ? (
        <div className="rpt-overview">
          <div className="rpt-panel">
            <h3>Top prodotti</h3>
            <div className="rpt-rank-list">
              {data.topProducts.map((p, i) => (
                <div className="rpt-rank-item" key={p.id}>
                  <span className="rpt-rank-pos">{i + 1}</span>
                  <div className="rpt-rank-info">
                    <span className="rpt-rank-name">{p.name}</span>
                    <span className="rpt-rank-sku mono">{p.sku}</span>
                  </div>
                  <span className="rpt-rank-qty">{p.qty} pz</span>
                  <span className="rpt-rank-amount">{formatMoney(p.revenueGross)}</span>
                </div>
              ))}
              {!data.topProducts.length && <div className="muted" style={{ padding: "1rem" }}>Nessun dato</div>}
            </div>
          </div>
          <div className="rpt-panel">
            <h3>Top clienti</h3>
            <div className="rpt-rank-list">
              {data.topClients.map((c, i) => (
                <div className="rpt-rank-item" key={c.id}>
                  <span className="rpt-rank-pos">{i + 1}</span>
                  <div className="rpt-rank-info">
                    <span className="rpt-rank-name">{c.name}</span>
                  </div>
                  <span className="rpt-rank-qty">{c.orders} ord.</span>
                  <span className="rpt-rank-amount">{formatMoney(c.revenueGross)}</span>
                </div>
              ))}
              {!data.topClients.length && <div className="muted" style={{ padding: "1rem" }}>Nessun dato</div>}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "details" ? (
        <div className="rpt-detail">
          <div className="rpt-detail-head">
            <span>{data.pagination.total} righe · Pagina {data.pagination.page}/{data.pagination.totalPages}</span>
          </div>
          <div className="rpt-detail-list">
            {data.lines.map((r) => (
              <div className="rpt-detail-row" key={r.id}>
                <span className="rpt-detail-date">{formatDateIT(r.createdAt)}</span>
                <span className="rpt-detail-order mono">{r.orderNumber || r.orderId.slice(-8).toUpperCase()}</span>
                <span className="rpt-detail-client">{r.companyName}</span>
                <span className="rpt-detail-sku mono">{r.sku}</span>
                <span className="rpt-detail-product">{r.productName}</span>
                <span className="rpt-detail-qty">{r.qty}</span>
                <span className="rpt-detail-net">{formatMoney(r.lineNet)}</span>
                <span className="rpt-detail-excise">{formatMoney(r.excise)}</span>
                <span className="rpt-detail-vat">{formatMoney(r.vat)}</span>
                <span className="rpt-detail-gross">{formatMoney(r.lineGross)}</span>
              </div>
            ))}
            {!data.lines.length && <div className="muted" style={{ padding: "2rem", textAlign: "center" }}>Nessuna riga nel periodo selezionato</div>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
