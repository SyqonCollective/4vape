import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Area,
} from "recharts";

// CHECKLIST (admin richieste):
// [x] Stati ordini recenti con etichette UI (non raw enum)

function statusLabel(status) {
  if (status === "SUBMITTED") return "In attesa pagamento";
  if (status === "APPROVED") return "Elaborazione";
  if (status === "FULFILLED") return "Completato";
  if (status === "CANCELLED") return "Fallito";
  return "Bozza";
}

function statusTone(status) {
  if (status === "SUBMITTED") return "pending";
  if (status === "APPROVED") return "processing";
  if (status === "FULFILLED") return "done";
  if (status === "CANCELLED") return "failed";
  return "draft";
}

function paymentLabel(method) {
  if (method === "BANK_TRANSFER") return "Bonifico";
  if (method === "CARD") return "Carta";
  if (method === "COD") return "Contrassegno";
  if (method === "OTHER") return "Altro";
  return "-";
}

const formatCurrency = (value) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    Number(value || 0)
  );

function computeOrderTotals(order) {
  return (order?.items || []).reduce(
    (acc, item) => {
      const lineTotal = Number(item.lineTotal || Number(item.unitPrice || 0) * Number(item.qty || 0));
      const qty = Number(item.qty || 0);
      const product = item.product;
      const rate = Number(product?.taxRate || product?.taxRateRef?.rate || 0);
      const exciseUnit = Number(
        product?.exciseTotal ?? (Number(product?.exciseMl || 0) + Number(product?.exciseProduct || 0))
      );
      const excise = exciseUnit * qty;
      const vat = rate > 0 ? (lineTotal + excise) * (rate / 100) : 0;
      acc.subtotal += lineTotal;
      acc.vat += vat;
      acc.excise += excise;
      return acc;
    },
    { subtotal: 0, vat: 0, excise: 0 }
  );
}

const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(5);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

function TrendSpark({ series = [] }) {
  if (!series.length) return null;
  const chartData = series.map((p) => ({
    ...p,
    day: shortDate(p.date),
    orders: Number(p.orders || 0),
    revenue: Number(p.revenue || 0),
  }));

  return (
    <div className="sparkline-box">
      <div className="sparkline">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 6 }}>
            <defs>
              <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#d6e1ee" />
            <XAxis dataKey="day" tick={{ fill: "#667085", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={14} />
            <YAxis yAxisId="orders" orientation="left" allowDecimals={false} tick={{ fill: "#667085", fontSize: 11 }} width={30} tickLine={false} axisLine={false} domain={[0, "dataMax + 1"]} />
            <YAxis yAxisId="revenue" orientation="right" tick={{ fill: "#667085", fontSize: 11 }} width={62} tickFormatter={(v) => `€${Math.round(v)}`} tickLine={false} axisLine={false} domain={[0, "dataMax + 20"]} />
            <Tooltip
              formatter={(value, name) => (name === "Fatturato" ? `€ ${Number(value || 0).toFixed(2)}` : Number(value || 0))}
              labelFormatter={(label) => `Giorno ${label}`}
              contentStyle={{ borderRadius: 12, border: "1px solid #d4dce8" }}
            />
            <Bar yAxisId="orders" dataKey="orders" name="Ordini" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={16} minPointSize={2} />
            <Area yAxisId="revenue" type="linear" dataKey="revenue" name="Fatturato" stroke="#22c55e" strokeWidth={2.6} fill="url(#dashRevenueFill)" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="spark-legend">
        <span><i className="legend-dot orders" /> Ordini</span>
        <span><i className="legend-dot revenue" /> Fatturato</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    products: 0,
    suppliers: 0,
    orders: 0,
    ordersToday: 0,
    pendingUsers: 0,
    pendingCompanies: 0,
    revenue: 0,
  });
  const [daily, setDaily] = useState([]);
  const [recent, setRecent] = useState([]);
  const [summaryOrder, setSummaryOrder] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/admin/metrics");
        if (!active) return;
        setStats(res.totals);
        setDaily(res.daily || []);
        setRecent(res.recentOrders || []);
        setError("");
      } catch {
        setError("Impossibile caricare i dati");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const trendSeries = useMemo(
    () =>
      daily.map((d) => ({
        date: d.date,
        orders: Number(d.count || 0),
        revenue: Number(d.total || 0),
      })),
    [daily]
  );
  const completionRate = useMemo(() => {
    const completed = recent.filter((o) => o.status === "FULFILLED").length;
    return recent.length ? Math.round((completed / recent.length) * 100) : 0;
  }, [recent]);

  async function openRecentOrderSummary(orderId) {
    try {
      setSummaryLoading(true);
      const rows = await api("/admin/orders");
      const found = (rows || []).find((o) => o.id === orderId);
      if (found) {
        setSummaryOrder(found);
      } else {
        setError("Dettaglio ordine non trovato");
      }
    } catch {
      setError("Impossibile aprire il riepilogo ordine");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <section className="dashboard-modern">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Panoramica operativa in tempo reale</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="dash-strip">
        <div className="dash-strip-item">
          <div className="dash-strip-label">Ordini oggi</div>
          <strong>{stats.ordersToday}</strong>
        </div>
        <div className="dash-strip-item">
          <div className="dash-strip-label">Tasso completamento</div>
          <strong>{completionRate}%</strong>
        </div>
        <div className="dash-strip-item">
          <div className="dash-strip-label">Richieste da approvare</div>
          <strong>{stats.pendingCompanies + stats.pendingUsers}</strong>
        </div>
      </div>

      <div className="cards dash-cards">
        <div className="card dash-card">
          <div className="card-label">Prodotti attivi</div>
          <div className="card-value">{stats.products}</div>
          <div className="card-sub">Catalogo pubblicato</div>
        </div>
        <div className="card dash-card">
          <div className="card-label">Ordini totali</div>
          <div className="card-value">{stats.orders}</div>
          <div className="card-sub">Storico complessivo</div>
        </div>
        <div className="card dash-card">
          <div className="card-label">Richieste B2B</div>
          <div className="card-value">{stats.pendingCompanies}</div>
          <div className="card-sub">Utenti in attesa: {stats.pendingUsers}</div>
        </div>
        <div className="card dash-card dash-card-revenue">
          <div className="card-label">Fatturato</div>
          <div className="card-value">€ {Number(stats.revenue || 0).toFixed(2)}</div>
          <div className="card-sub">Da ordini confermati</div>
        </div>
      </div>

      <div className="panel grid-2 dash-main-panels">
        <div className="dash-chart-panel">
          <h2>Trend ordini/fatturato (14 giorni)</h2>
          <TrendSpark series={trendSeries} />
          <div className="muted" style={{ fontSize: "0.84rem" }}>Periodo: ultimi 14 giorni</div>
        </div>
        <div className="dash-recent-panel">
          <h2>Ordini recenti</h2>
          <div className="muted dash-recent-hint">Clicca una riga per aprire il riepilogo</div>
          <div className="table compact">
            <div className="row header">
              <div>Cliente</div>
              <div>Stato</div>
              <div>Totale</div>
            </div>
            {recent.map((o) => (
              <button
                type="button"
                className="row dash-recent-row"
                key={o.id}
                onClick={() => openRecentOrderSummary(o.id)}
                disabled={summaryLoading}
              >
                <div>{o.company}</div>
                <div>
                  <span className={`status-pill ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                </div>
                <div>€ {Number(o.total).toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {summaryOrder ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSummaryOrder(null)}>
            <div className="modal order-modal shopify-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Riepilogo ordine</div>
                  <div className="modal-subtitle">
                    #{summaryOrder.orderNumber || "-"} • {summaryOrder.company?.name || summaryOrder.company || "-"}
                  </div>
                </div>
                <button className="btn ghost" onClick={() => setSummaryOrder(null)}>
                  Chiudi
                </button>
              </div>

              <div className="modal-body">
                <div className="order-form-grid">
                  <div className="order-card">
                    <h4>Dettagli</h4>
                    <div className="summary-grid">
                      <div>
                        <strong>Stato</strong>
                        <div>{statusLabel(summaryOrder.status)}</div>
                      </div>
                      <div>
                        <strong>Pagamento</strong>
                        <div>{paymentLabel(summaryOrder.paymentMethod)}</div>
                      </div>
                      <div>
                        <strong>Creato</strong>
                        <div>{new Date(summaryOrder.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="order-card">
                    <h4>Righe ordine</h4>
                    <div className="table compact">
                      <div className="row header">
                        <div>Prodotto</div>
                        <div>Q.tà</div>
                        <div>Totale</div>
                      </div>
                      {(summaryOrder.items || []).map((item) => (
                        <div className="row" key={item.id || `${item.productId}-${item.sku}`}>
                          <div>
                            <strong>{item.name}</strong>
                            <div className="muted mono">{item.sku}</div>
                          </div>
                          <div>{item.qty}</div>
                          <div>{formatCurrency(item.lineTotal)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="order-card order-summary-card">
                  <h4>Totali</h4>
                  {(() => {
                    const totals = computeOrderTotals(summaryOrder);
                    const total = totals.subtotal + totals.vat + totals.excise;
                    return (
                      <div className="summary-stack">
                        <div className="summary-row">
                          <span>Imponibile</span>
                          <strong>{formatCurrency(totals.subtotal)}</strong>
                        </div>
                        <div className="summary-row">
                          <span>Accisa</span>
                          <strong>{formatCurrency(totals.excise)}</strong>
                        </div>
                        <div className="summary-row">
                          <span>IVA</span>
                          <strong>{formatCurrency(totals.vat)}</strong>
                        </div>
                        <div className="summary-row total">
                          <span>Totale</span>
                          <strong>{formatCurrency(total)}</strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
