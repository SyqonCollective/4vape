import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import italyMapAsset from "../../../map.svg";

// CHECKLIST (admin richieste):
// [x] Accisa prima di IVA
// [x] Margine netto (imponibile - costo prodotti)
// [x] "Fornitori top" sostituito con "Migliori clienti"
// [x] Grafico flussi cassa
// [x] Correzione offset cartina (rimosso shift hardcoded)

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

function calcTrend(series = []) {
  if (!series.length) return [];
  const n = series.length;
  const xs = series.map((_, i) => i);
  const ys = series.map((s) => Number(s.value || 0));
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumX2 - sumX * sumX || 1;
  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  return xs.map((x) => ({ label: series[x].label, value: m * x + b }));
}

function TrendChart({ series = [], variant = "line" }) {
  if (!series.length) return null;
  if (series.length === 1) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="analytics-trend">
        <line x1="0" y1="50" x2="100" y2="50" className="chart-gridline" />
        <circle cx="50" cy="50" r="3.2" fill="currentColor" />
      </svg>
    );
  }
  const max = Math.max(...series.map((s) => s.value), 1);
  const min = Math.min(...series.map((s) => s.value), 0);
  const range = max - min || 1;
  const toPoint = (arr) =>
    arr
      .map((s, i) => {
        const x = (i / Math.max(arr.length - 1, 1)) * 100;
        const y = 100 - ((s.value - min) / range) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const points = toPoint(series);
  const trendPoints = toPoint(calcTrend(series));

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="analytics-trend">
      <line x1="0" y1="25" x2="100" y2="25" className="chart-gridline" />
      <line x1="0" y1="50" x2="100" y2="50" className="chart-gridline" />
      <line x1="0" y1="75" x2="100" y2="75" className="chart-gridline" />
      {variant === "area" ? <polygon points={`0,100 ${points} 100,100`} className="chart-area-fill" /> : null}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.8" />
      <polyline points={trendPoints} fill="none" className="chart-trendline" strokeWidth="2" />
      {series.map((s, i) => {
        const x = (i / Math.max(series.length - 1, 1)) * 100;
        const y = 100 - ((s.value - min) / range) * 100;
        return <circle key={`${s.label}-${i}`} cx={x} cy={y} r="1.7" fill="currentColor" opacity="0.75" />;
      })}
    </svg>
  );
}

function StackedChart({ series = [] }) {
  if (!series.length) return null;
  const max = Math.max(...series.map((s) => s.revenue), 1);
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
        const width = Math.max(barWidth - 2, 0.6);
        const left = x + (barWidth - width) / 2;

        let y = 100;
        const rects = [];
        const pushRect = (h, cls) => {
          if (h <= 0) return;
          y -= h;
          rects.push(
            <rect
              key={`${s.date}-${cls}`}
              x={left}
              y={y}
              width={width}
              height={h}
              className={cls}
              rx={1.4}
              ry={1.4}
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

const ITALY_REGIONS = [
  { key: "Valle d'Aosta", x: 408, y: 192 },
  { key: "Piemonte", x: 532, y: 286 },
  { key: "Liguria", x: 500, y: 402 },
  { key: "Lombardia", x: 728, y: 272 },
  { key: "Trentino-Alto Adige", x: 882, y: 184 },
  { key: "Veneto", x: 958, y: 288 },
  { key: "Friuli-Venezia Giulia", x: 1108, y: 272 },
  { key: "Emilia-Romagna", x: 820, y: 434 },
  { key: "Toscana", x: 748, y: 604 },
  { key: "Umbria", x: 872, y: 664 },
  { key: "Marche", x: 986, y: 636 },
  { key: "Lazio", x: 842, y: 824 },
  { key: "Abruzzo", x: 996, y: 786 },
  { key: "Molise", x: 1040, y: 898 },
  { key: "Campania", x: 886, y: 1004 },
  { key: "Puglia", x: 1158, y: 1018 },
  { key: "Basilicata", x: 1024, y: 1126 },
  { key: "Calabria", x: 1046, y: 1340 },
  { key: "Sicilia", x: 810, y: 1732 },
  { key: "Sardegna", x: 468, y: 1326 },
];

const REGION_ALIASES = {
  "VALLE D AOSTA": "Valle d'Aosta",
  "VALLEDAOSTA": "Valle d'Aosta",
  PIEMONTE: "Piemonte",
  LIGURIA: "Liguria",
  LOMBARDIA: "Lombardia",
  "TRENTINO ALTO ADIGE": "Trentino-Alto Adige",
  VENETO: "Veneto",
  "FRIULI VENEZIA GIULIA": "Friuli-Venezia Giulia",
  "EMILIA ROMAGNA": "Emilia-Romagna",
  TOSCANA: "Toscana",
  UMBRIA: "Umbria",
  MARCHE: "Marche",
  LAZIO: "Lazio",
  ABRUZZO: "Abruzzo",
  MOLISE: "Molise",
  CAMPANIA: "Campania",
  PUGLIA: "Puglia",
  BASILICATA: "Basilicata",
  CALABRIA: "Calabria",
  SICILIA: "Sicilia",
  SARDEGNA: "Sardegna",
};

function normalizeArea(value = "") {
  return String(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRegionData(topGeo = []) {
  const map = new Map(ITALY_REGIONS.map((r) => [r.key, { ...r, revenue: 0, orders: 0 }]));
  for (const row of topGeo) {
    const norm = normalizeArea(row.area);
    const region =
      REGION_ALIASES[norm] ||
      ITALY_REGIONS.find((r) => norm.includes(normalizeArea(r.key)))?.key;
    if (!region || !map.has(region)) continue;
    const cur = map.get(region);
    cur.revenue += Number(row.revenue || 0);
    cur.orders += Number(row.orders || 0);
  }
  return Array.from(map.values());
}

function ItalyMap({ data = [] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const [active, setActive] = useState(null);
  return (
    <div className="italy-map-wrap">
      <div className="italy-map-canvas">
        <img src={italyMapAsset} className="italy-map" alt="Cartina Italia" />
        <svg viewBox="0 0 1600 2000" className="italy-map-overlay" aria-hidden="true">
          {data.map((region) => {
            const intensity = Math.max(region.revenue / max, 0);
            const radius = 18 + intensity * 34;
            const alpha = 0.28 + intensity * 0.62;
            const cx = region.x;
            const cy = region.y;
            return (
              <g
                key={region.key}
                onMouseEnter={() => setActive(region)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(region)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={cx} cy={cy} r={radius + 7} fill={`rgba(14,165,233,${alpha * 0.24})`} />
                <circle cx={cx} cy={cy} r={radius} fill={`rgba(14,165,233,${alpha})`} />
                <circle cx={cx} cy={cy} r={7.5} fill="#0369a1" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="italy-map-side">
        <div className="muted">Top aree nel periodo</div>
        <div className="table compact">
          <div className="row header">
            <div>Area</div>
            <div>Ordini</div>
            <div>Fatturato</div>
          </div>
          {data
            .filter((d) => d.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)
            .map((d) => (
              <div className="row" key={d.key}>
                <div>{d.key}</div>
                <div>{d.orders}</div>
                <div>{formatMoney(d.revenue)}</div>
              </div>
            ))}
        </div>
        {active ? (
          <div className="italy-active">
            <strong>{active.key}</strong>
            <div>Ordini: {active.orders}</div>
            <div>Fatturato: {formatMoney(active.revenue)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const defaultRange = useMemo(() => rangeDays(30), []);
  const [startDate, setStartDate] = useState(toDateInput(defaultRange.start));
  const [endDate, setEndDate] = useState(toDateInput(defaultRange.end));
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSkuSearch, setProductSkuSearch] = useState("");
  const [productOptions, setProductOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    totals: {
      revenue: 0,
      cost: 0,
      vat: 0,
      excise: 0,
      expenses: 0,
      cashflow: 0,
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
    topGeo: [],
    topClients: [],
    productInsights: null,
  });

  async function load(range, productId = selectedProductId) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: range.start,
        end: range.end,
      });
      if (productId) params.set("productId", productId);
      const res = await api(
        `/admin/analytics?${params.toString()}`
      );
      setData(res);
    } catch {
      setError("Impossibile caricare analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ start: startDate, end: endDate });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const products = await api("/admin/products");
        if (!active) return;
        setProductOptions(
          (products || [])
            .map((p) => ({
              id: p.id,
              label: `${p.sku} · ${p.name}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, "it"))
        );
      } catch {
        if (active) setProductOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const revenueSeries = data.daily.map((d) => ({ label: d.date, value: d.revenue }));
  const costSeries = data.daily.map((d) => ({ label: d.date, value: d.cost }));
  const regionData = buildRegionData(data.topGeo || []);
  const selectedSeries = (data.productInsights?.daily || []).map((d) => ({
    label: d.date,
    value: d.revenue,
  }));
  const stackedSeries = data.daily.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    cost: d.cost,
    vat: d.vat,
    excise: d.excise,
    margin: d.margin,
  }));
  const cashflowSeries = data.daily.map((d) => ({
    label: d.date,
    value: Number(d.cashflow ?? (Number(d.revenue || 0) - Number(d.expenses || 0))),
  }));
  const skuMatches = useMemo(() => {
    const q = productSkuSearch.trim().toLowerCase();
    if (!q) return [];
    return productOptions.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 50);
  }, [productOptions, productSkuSearch]);

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
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            A
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label>
            Cerca SKU prodotto
            <input
              type="text"
              value={productSkuSearch}
              onChange={(e) => setProductSkuSearch(e.target.value)}
              placeholder="Es. 33840"
            />
          </label>
          <label>
            Prodotto trovato
            <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
              <option value="">Tutti i prodotti</option>
              {(productSkuSearch.trim() ? skuMatches : productOptions).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" onClick={() => load({ start: startDate, end: endDate })} disabled={loading}>
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
        <div className="card"><div className="card-label">Fatturato</div><div className="card-value">{formatMoney(data.totals.revenue)}</div><div className="card-sub">Ordini nel periodo</div></div>
        <div className="card"><div className="card-label">Costo prodotti</div><div className="card-value">{formatMoney(data.totals.cost)}</div><div className="card-sub">Costo fornitore stimato</div></div>
        <div className="card"><div className="card-label">Margine netto</div><div className="card-value">{formatMoney(data.totals.grossMargin)}</div><div className="card-sub">Imponibile - costo prodotti</div></div>
        <div className="card"><div className="card-label">Accise</div><div className="card-value">{formatMoney(data.totals.excise)}</div><div className="card-sub">Totale accise</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{formatMoney(data.totals.vat)}</div><div className="card-sub">Calcolata sul prezzo</div></div>
        <div className="card"><div className="card-label">Ordini / Pezzi</div><div className="card-value">{data.totals.orders}</div><div className="card-sub">{data.totals.items} articoli</div></div>
        <div className="card"><div className="card-label">Flusso cassa netto</div><div className="card-value">{formatMoney(data.totals.cashflow)}</div><div className="card-sub">Vendite - arrivi merce</div></div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Fatturato vs Costi (trend)</h2>
              <div className="muted">Linee + trendline</div>
            </div>
          </div>
          <div className="chart-stack">
            <div className="chart-row">
              <span className="chart-label revenue">Fatturato</span>
              <div className="trend-revenue">
                <TrendChart series={revenueSeries} variant="area" />
              </div>
            </div>
            <div className="chart-row">
              <span className="chart-label cost">Costi</span>
              <div className="trend-cost">
                <TrendChart series={costSeries} variant="line" />
              </div>
            </div>
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Composizione margine</h2>
              <div className="muted">Costi, IVA, accise, margine netto</div>
            </div>
          </div>
          <StackedChart series={stackedSeries} />
        </div>
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Flusso cassa</h2>
              <div className="muted">Vendite - spese (arrivi merce)</div>
            </div>
          </div>
          <div className="trend-revenue">
            <TrendChart series={cashflowSeries} variant="line" />
          </div>
        </div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Cartina Italia interattiva</h2>
              <div className="muted">Aree con più vendite nel periodo selezionato</div>
            </div>
          </div>
          <ItalyMap data={regionData} />
        </div>
      </div>

      <div className="panel analytics-grid">
        <div className="analytics-panel">
          <div className="panel-header"><div><h2>Prodotti top</h2><div className="muted">Per fatturato</div></div></div>
          <div className="table compact">
            <div className="row header"><div>Prodotto</div><div>SKU</div><div>Fatturato</div><div>Q.tà</div></div>
            {data.topProducts.map((p) => (
              <div className="row" key={p.id}><div>{p.name}</div><div className="mono">{p.sku}</div><div>{formatMoney(p.revenue)}</div><div>{p.qty}</div></div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header"><div><h2>Migliori clienti</h2><div className="muted">Per fatturato nel periodo</div></div></div>
          <div className="table compact">
            <div className="row header"><div>Cliente</div><div>Ordini</div><div>Fatturato</div></div>
            {(data.topClients || []).map((c) => (
              <div className="row" key={c.id}><div>{c.name}</div><div>{c.orders}</div><div>{formatMoney(c.revenue)}</div></div>
            ))}
          </div>
        </div>
        <div className="analytics-panel">
          <div className="panel-header"><div><h2>Categorie top</h2><div className="muted">Fatturato per categoria</div></div></div>
          <div className="table compact">
            <div className="row header"><div>Categoria</div><div>Fatturato</div><div>Articoli</div></div>
            {data.topCategories.map((c) => (
              <div className="row" key={c.name}><div>{c.name}</div><div>{formatMoney(c.revenue)}</div><div>{c.qty}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel analytics-grid analytics-grid-single">
        <div className="analytics-panel">
          <div className="panel-header">
            <div>
              <h2>Analisi singolo prodotto</h2>
              <div className="muted">Seleziona un prodotto nel filtro per vedere dettaglio</div>
            </div>
          </div>
          {selectedProductId ? (
            data.productInsights?.product ? (
              <>
                <div className="cards" style={{ marginBottom: "12px" }}>
                  <div className="card"><div className="card-label">Prodotto</div><div className="card-sub">{data.productInsights.product.sku}</div><div className="card-value" style={{ fontSize: "1.05rem" }}>{data.productInsights.product.name}</div></div>
                  <div className="card"><div className="card-label">Fatturato</div><div className="card-value">{formatMoney(data.productInsights.totals.revenue)}</div><div className="card-sub">Nel periodo</div></div>
                  <div className="card"><div className="card-label">Ordini / Pezzi</div><div className="card-value">{data.productInsights.totals.orders}</div><div className="card-sub">{data.productInsights.totals.items} pezzi</div></div>
                </div>
                <div className="trend-revenue">
                  <TrendChart series={selectedSeries} variant="area" />
                </div>
              </>
            ) : (
              <div className="muted">Nessuna vendita per il prodotto selezionato nel periodo.</div>
            )
          ) : (
            <div className="muted">Cerca SKU in alto e seleziona il prodotto.</div>
          )}
        </div>
      </div>
    </section>
  );
}
