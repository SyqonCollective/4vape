import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

function Sparkline({ points = [] }) {
  if (!points.length) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const coords = points.map((v, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox="0 0 100 100" className="sparkline" preserveAspectRatio="none">
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth="3" />
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
      } catch (err) {
        setError("Impossibile caricare i dati");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Panoramica veloce dell'attività</p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

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
          <h2>Andamento ordini (14 giorni)</h2>
          <Sparkline points={daily.map((d) => d.count)} />
          <div className="muted">Ultimi 14 giorni — trend ordini</div>
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
