import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

// CHECKLIST (admin richieste):
// [x] Stati ordini recenti con etichette UI (non raw enum)

function statusLabel(status) {
  if (status === "SUBMITTED") return "In attesa pagamento";
  if (status === "APPROVED") return "Elaborazione";
  if (status === "FULFILLED") return "Completato";
  if (status === "CANCELLED") return "Fallito";
  return "Bozza";
}

function calcTrend(values = []) {
  if (!values.length) return [];
  const n = values.length;
  const sumX = ((n - 1) * n) / 2;
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((acc, y, x) => acc + x * y, 0);
  const denom = n * sumX2 - sumX * sumX || 1;
  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  return values.map((_, x) => m * x + b);
}

function toPoints(values = [], min = 0, range = 1) {
  return values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((Number(v || 0) - min) / (range || 1)) * 100;
      return { x, y };
    });
}

function TrendSpark({ series = [] }) {
  if (!series.length) return null;
  const ordersValues = series.map((p) => Number(p.orders || 0));
  const revenueValues = series.map((p) => Number(p.revenue || 0));
  const ordersMin = Math.min(...ordersValues);
  const ordersMax = Math.max(...ordersValues, 1);
  const revenueMin = Math.min(...revenueValues);
  const revenueMax = Math.max(...revenueValues, 1);
  const ordersRange = ordersMax - ordersMin || 1;
  const revenueRange = revenueMax - revenueMin || 1;

  const ordersPts = toPoints(ordersValues, ordersMin, ordersRange);
  const revenuePts = toPoints(revenueValues, revenueMin, revenueRange);
  const ordersPath = ordersPts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const revenuePath = revenuePts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const revenueArea = `0,100 ${revenuePath} 100,100`;

  const ordersTrend = calcTrend(ordersValues);
  const revenueTrend = calcTrend(revenueValues);
  const ordersTrendPath = toPoints(ordersTrend, ordersMin, ordersRange)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const revenueTrendPath = toPoints(revenueTrend, revenueMin, revenueRange)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const barWidth = 100 / Math.max(series.length, 1);

  return (
    <div className="sparkline-box">
      <svg viewBox="0 0 100 100" className="sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dashRevenueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1="0" y1="25" x2="100" y2="25" className="chart-gridline" />
      <line x1="0" y1="50" x2="100" y2="50" className="chart-gridline" />
      <line x1="0" y1="75" x2="100" y2="75" className="chart-gridline" />
      {ordersPts.map((p, i) => {
        const h = ((ordersValues[i] - ordersMin) / ordersRange) * 100;
        const w = Math.max(barWidth - 1.6, 1);
        const x = i * barWidth + (barWidth - w) / 2;
        return <rect key={`bar-${i}`} x={x} y={100 - h} width={w} height={h} className="spark-bar" rx="1" />;
      })}
      <polygon points={revenueArea} fill="url(#dashRevenueFill)" />
      <polyline points={revenuePath} fill="none" stroke="#22c55e" strokeWidth="2.4" />
      <polyline points={ordersPath} fill="none" stroke="#0ea5e9" strokeWidth="1.8" opacity="0.7" />
      <polyline points={ordersTrendPath} fill="none" className="chart-trendline chart-trendline-orders" strokeWidth="1.5" />
      <polyline points={revenueTrendPath} fill="none" className="chart-trendline chart-trendline-revenue" strokeWidth="1.6" />
      {revenuePts.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="1.5" className="spark-dot" />
      ))}
      </svg>
      <div className="spark-legend">
        <span><i className="legend-dot revenue" /> Fatturato</span>
        <span><i className="legend-dot orders" /> Ordini</span>
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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Panoramica veloce dell'attività</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards">
        <div className="card">
          <div className="card-label">Prodotti attivi</div>
          <div className="card-value">{stats.products}</div>
          <div className="card-sub">Nel catalogo</div>
        </div>
        <div className="card">
          <div className="card-label">Ordini totali</div>
          <div className="card-value">{stats.orders}</div>
          <div className="card-sub">Oggi: {stats.ordersToday}</div>
        </div>
        <div className="card">
          <div className="card-label">Richieste B2B</div>
          <div className="card-value">{stats.pendingCompanies}</div>
          <div className="card-sub">Utenti in attesa: {stats.pendingUsers}</div>
        </div>
        <div className="card">
          <div className="card-label">Fatturato</div>
          <div className="card-value">€ {Number(stats.revenue || 0).toFixed(2)}</div>
          <div className="card-sub">Da ordini confermati</div>
        </div>
      </div>

      <div className="panel grid-2">
        <div>
          <h2>Trend ordini/fatturato (14 giorni)</h2>
          <TrendSpark series={trendSeries} />
          <div className="muted">Azzurro = ordini (scala dedicata), verde = fatturato (scala dedicata)</div>
        </div>
        <div>
          <h2>Ordini recenti</h2>
          <div className="table compact">
            <div className="row header">
              <div>Cliente</div>
              <div>Stato</div>
              <div>Totale</div>
            </div>
            {recent.map((o) => (
              <div className="row" key={o.id}>
                <div>{o.company}</div>
                <div className="mono">{statusLabel(o.status)}</div>
                <div>€ {Number(o.total).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
