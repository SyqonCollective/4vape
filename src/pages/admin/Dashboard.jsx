import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
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
          <div className="muted" style={{ fontSize: "0.84rem" }}>Periodo: ultimi 14 giorni</div>
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
