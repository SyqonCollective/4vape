import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

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

function LineChart({ series = [], height = 200 }) {
  if (!series.length) return null;
  const max = Math.max(...series.map((s) => s.value), 1);
  const min = Math.min(...series.map((s) => s.value), 0);
  const range = max - min || 1;
  const points = series.map((s, i) => {
    const x = (i / Math.max(series.length - 1, 1)) * 100;
    const y = 100 - ((s.value - min) / range) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="analytics-line">
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function AreaChart({ series = [] }) {
  if (!series.length) return null;
  const max = Math.max(...series.map((s) => s.value), 1);
  const min = Math.min(...series.map((s) => s.value), 0);
  const range = max - min || 1;
  const points = series.map((s, i) => {
    const x = (i / Math.max(series.length - 1, 1)) * 100;
    const y = 100 - ((s.value - min) / range) * 100;
    return { x, y };
  });
  const areaPoints = [
    { x: 0, y: 100 },
    ...points,
    { x: 100, y: 100 },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="analytics-area">
      <polyline
        points={areaPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
        fill="currentColor"
        opacity="0.18"
      />
      <polyline
        points={points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

function StackedChart({ series = [], height = 200 }) {
  if (!series.length) return null;
  const max = Math.max(
    ...series.map((s) => s.revenue),
    1
  );
  const barWidth = 100 / Math.max(series.length, 1);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="analytics-stacked">
      {series.map((s, i) => {
        const x = i * barWidth;
        const total = max || 1;
        const costH = (s.cost / total) * 100;
        const vatH = (s.vat / total) * 100;
        const exciseH = (s.excise / total) * 100;
        const marginH = (s.margin / total) * 100;
        let y = 100;
        const rects = [];
        const pushRect = (h, cls) => {
          if (h <= 0) return;
          y -= h;
          rects.push(
            <rect
              key={`${s.date}-${cls}`}
              x={x + 4}
              y={y}
              width={barWidth - 8}
              height={h}
              className={cls}
              rx={2}
              ry={2}
            />
          );
        };
        pushRect(costH, "stack-cost");
        pushRect(vatH, "stack-vat");
        pushRect(exciseH, "stack-excise");
        pushRect(marginH, "stack-margin");
        return rects;
      })}
    </svg>
  );
}

export default function AdminAnalytics() {
  const defaultRange = useMemo(() => rangeDays(30), []);
  const [startDate, setStartDate] = useState(toDateInput(defaultRange.start));
  const [endDate, setEndDate] = useState(toDateInput(defaultRange.end));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    totals: {
      revenue: 0,
      cost: 0,
      vat: 0,
      excise: 0,
      margin: 0,
      grossMargin: 0,
      netRevenue: 0,
      orders: 0,
      items: 0,
    },
    kpis: {
      avgOrderValue: 0,
      avgItemsPerOrder: 0,
      marginPct: 0,
      vatPct: 0,
      excisePct: 0,
    },
    daily: [],
    topProducts: [],
    topSuppliers: [],
    topCategories: [],
  });

  async function load(range) {
    setLoading(true);
    setError("");
    try {
      const res = await api(
        `/admin/analytics?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
      );
      setData(res);
    } catch (err) {
      setError("Impossibile caricare analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ start: startDate, end: endDate });
  }, []);

  const revenueSeries = data.daily.map((d) => ({ label: d.date, value: d.revenue }));
  const costSeries = data.daily.map((d) => ({ label: d.date, value: d.cost }));
  const stackedSeries = data.daily.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    cost: d.cost,
    vat: d.vat,
    excise: d.excise,
    margin: d.margin,
  }));

  async function exportData(format) {
    const token = getToken();
    const res = await fetch(
      `/api/admin/analytics/export?format=${format}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    if (!res.ok) throw new Error("Export fallito");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_${startDate}_${endDate}.${format === "csv" ? "csv" : "xls"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p>Fatturato, costi e tassazione per periodo</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="analytics-toolbar">
        <div className="analytics-filters">
          <label>
            Da
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            A
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            onClick={() => load({ start: startDate, end: endDate })}
            disabled={loading}
          >
            {loading ? "Carico..." : "Aggiorna"}
          </button>
        </div>
        <div className="analytics-quick">
          <button className="btn ghost" onClick={() => {
            const r = rangeDays(7);
            setStartDate(toDateInput(r.start));
            setEndDate(toDateInput(r.end));
            load({ start: toDateInput(r.start), end: toDateInput(r.end) });
          }}>7 giorni</button>
          <button className="btn ghost" onClick={() => {
            const r = rangeDays(30);
            setStartDate(toDateInput(r.start));
            setEndDate(toDateInput(r.end));
            load({ start: toDateInput(r.start), end: toDateInput(r.end) });
          }}>30 giorni</button>
          <button className="btn ghost" onClick={() => {
            const r = rangeDays(90);
            setStartDate(toDateInput(r.start));
            setEndDate(toDateInput(r.end));
            load({ start: toDateInput(r.start), end: toDateInput(r.end) });
          }}>90 giorni</button>
        </div>
        <div className="analytics-export">
          <button className="btn ghost" onClick={() => exportData("csv")}>Export CSV</button>
          <button className="btn ghost" onClick={() => exportData("xls")}>Export Excel</button>
        </div>
      </div>

      <div className="cards analytics-cards">
        <div className="card">
          <div className="card-label">Fatturato</div>
          <div className="card-value">{formatMoney(data.totals.revenue)}</div>
          <div className="card-sub">Ordini nel periodo</div>
        </div>
        <div className="card">
          <div className="card-label">Costo prodotti</div>
          <div className="card-value">{formatMoney(data.totals.cost)}</div>
          <div className="card-sub">Costo fornitore stimato</div>
        </div>
        <div className="card">
          <div className="card-label">Margine lordo</div>
          <div className="card-value">{formatMoney(data.totals.grossMargin)}</div>
          <div className="card-sub">Senza tasse</div>
        </div>
        <div className="card">
          <div className="card-label">IVA</div>
          <div className="card-value">{formatMoney(data.totals.vat)}</div>
          <div className="card-sub">Calcolata sul prezzo</div>
        </div>
        <div className="card">
          <div className="card-label">Accise</div>
          <div className="card-value">{formatMoney(data.totals.excise)}</div>
          <div className="card-sub">Totale accise</div>
        </div>
        <div className="card">
          <div className="card-label">Ordini / Pezzi</div>
          <div className="card-value">{data.totals.orders}</div>
          <div className="card-sub">{data.totals.items} articoli</div>
        </div>
        <div className="card">
          <div className="card-label">Margine netto</div>
          <div className="card-value">{formatMoney(data.totals.margin)}</div>
          <div className="card-sub">Dopo tasse</div>
        </div>
        <div className="card">
          <div className="card-label">AOV</div>
          <div className="card-value">{formatMoney(data.kpis.avgOrderValue)}</div>
          <div className="card-sub">Media ordine</div>
        </div>
        <div className="card">
          <div className="card-label">Articoli / ordine</div>
          <div className="card-value">{Number(data.kpis.avgItemsPerOrder || 0).toFixed(2)}</div>
          <div className="card-sub">Media pezzi</div>
        </div>
        <div className="card">
          <div className="card-label">Margine %</div>
          <div className="card-value">{Number(data.kpis.marginPct || 0).toFixed(1)}%</div>
          <div className="card-sub">Sul fatturato</div>
        </div>
        <div className="card">
          <div className="card-label">Incidenza IVA</div>
          <div className="card-value">{Number(data.kpis.vatPct || 0).toFixed(1)}%</div>
          <div className="card-sub">Media periodo</div>
        </div>
        <div className="card">
          <div className="card-label">Incidenza accise</div>
          <div className="card-value">{Number(data.kpis.excisePct || 0).toFixed(1)}%</div>
          <div className="card-sub">Media periodo</div>
        </div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Fatturato vs Costi</h2>
              <div className="muted">Andamento giornaliero</div>
            </div>
          </div>
          <div className="chart-stack">
            <div className="chart-row">
              <span className="chart-label revenue">Fatturato</span>
              <AreaChart series={revenueSeries} />
            </div>
            <div className="chart-row">
              <span className="chart-label cost">Costi</span>
              <LineChart series={costSeries} />
            </div>
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Stacked taxes</h2>
              <div className="muted">Costi, IVA, accise, margine</div>
            </div>
          </div>
          <StackedChart series={stackedSeries} />
        </div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Prodotti top</h2>
              <div className="muted">Per fatturato</div>
            </div>
          </div>
          <div className="table compact">
            <div className="row header">
              <div>Prodotto</div>
              <div>SKU</div>
              <div>Fatturato</div>
              <div>Q.tà</div>
            </div>
            {data.topProducts.map((p) => (
              <div className="row" key={p.id}>
                <div>{p.name}</div>
                <div className="mono">{p.sku}</div>
                <div>{formatMoney(p.revenue)}</div>
                <div>{p.qty}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Fornitori top</h2>
              <div className="muted">Per fatturato</div>
            </div>
          </div>
          <div className="table compact">
            <div className="row header">
              <div>Fornitore</div>
              <div>Fatturato</div>
              <div>Articoli</div>
            </div>
            {data.topSuppliers.map((s) => (
              <div className="row" key={s.id}>
                <div>{s.name}</div>
                <div>{formatMoney(s.revenue)}</div>
                <div>{s.qty}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Categorie top</h2>
              <div className="muted">Fatturato per categoria</div>
            </div>
          </div>
          <div className="table compact">
            <div className="row header">
              <div>Categoria</div>
              <div>Fatturato</div>
              <div>Articoli</div>
            </div>
            {data.topCategories.map((c) => (
              <div className="row" key={c.name}>
                <div>{c.name}</div>
                <div>{formatMoney(c.revenue)}</div>
                <div>{c.qty}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
