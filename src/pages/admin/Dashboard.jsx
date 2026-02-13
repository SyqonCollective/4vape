import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

function TrendSpark({ series = [] }) {
  if (!series.length) return null;
  const max = Math.max(...series.map((p) => Math.max(p.orders, p.revenue)), 1);
  const min = 0;
  const range = max - min || 1;

  const points = (key) =>
    series
      .map((p, i) => {
        const x = (i / Math.max(series.length - 1, 1)) * 100;
        const y = 100 - ((Number(p[key] || 0) - min) / range) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="sparkline" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" className="chart-gridline" />
      <line x1="0" y1="50" x2="100" y2="50" className="chart-gridline" />
      <line x1="0" y1="75" x2="100" y2="75" className="chart-gridline" />
      <polyline points={points("orders")} fill="none" stroke="#0ea5e9" strokeWidth="2.4" />
      <polyline points={points("revenue")} fill="none" stroke="#22c55e" strokeWidth="2.2" />
    </svg>
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
          <div className="muted">Azzurro = ordini, verde = fatturato</div>
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
                <div className="mono">{o.status}</div>
                <div>€ {Number(o.total).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
