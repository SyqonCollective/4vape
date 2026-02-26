import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Area,
  Line,
  ReferenceLine,
  BarChart,
} from "recharts";

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

const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(5);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

function TrendChart({ series = [], variant = "line" }) {
  if (!series.length) return null;
  const chartData = series.map((s) => ({
    day: shortDate(s.label),
    value: Number(s.value || 0),
  }));
  const hasNegative = chartData.some((x) => x.value < 0);

  return (
    <div className="analytics-trend">
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d6e1ee" />
          <XAxis dataKey="day" tick={{ fill: "#667085", fontSize: 11 }} />
          <YAxis tick={{ fill: "#667085", fontSize: 11 }} width={54} />
          <Tooltip
            formatter={(value) => `€ ${Number(value || 0).toFixed(2)}`}
            contentStyle={{ borderRadius: 12, border: "1px solid #d4dce8" }}
          />
          {hasNegative ? <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 3" /> : null}
          {variant === "area" ? (
            <Area type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2.4} fill="#16a34a" fillOpacity={0.16} />
          ) : (
            <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2.4} dot={{ r: 2 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComboBarLineChart({ bars = [], line = [] }) {
  if (!bars.length) return null;
  const chartData = bars.map((b, i) => ({
    day: shortDate(b.label),
    orders: Number(b.value || 0),
    revenue: Number(line[i]?.value || 0),
  }));
  return (
    <div className="analytics-combo">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d6e1ee" />
          <XAxis dataKey="day" tick={{ fill: "#667085", fontSize: 11 }} />
          <YAxis yAxisId="orders" allowDecimals={false} tick={{ fill: "#667085", fontSize: 11 }} width={30} />
          <YAxis yAxisId="revenue" orientation="right" tick={{ fill: "#667085", fontSize: 11 }} width={62} tickFormatter={(v) => `€${Math.round(v)}`} />
          <Tooltip
            formatter={(value, name) => (name === "Fatturato" ? `€ ${Number(value || 0).toFixed(2)}` : Number(value || 0))}
            contentStyle={{ borderRadius: 12, border: "1px solid #d4dce8" }}
          />
          <Legend />
          <Bar yAxisId="orders" dataKey="orders" name="Ordini" fill="#0ea5e9" radius={[5, 5, 0, 0]} barSize={12} />
          <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Fatturato" stroke="#16a34a" strokeWidth={2.4} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedChart({ series = [] }) {
  if (!series.length) return null;
  const chartData = series.map((s) => ({
    day: shortDate(s.date),
    cost: Number(s.cost || 0),
    vat: Number(s.vat || 0),
    excise: Number(s.excise || 0),
    margin: Number(s.margin || 0),
  }));

  return (
    <div className="analytics-stacked">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d6e1ee" />
          <XAxis dataKey="day" tick={{ fill: "#667085", fontSize: 11 }} />
          <YAxis tick={{ fill: "#667085", fontSize: 11 }} width={62} />
          <Tooltip
            formatter={(value) => `€ ${Number(value || 0).toFixed(2)}`}
            contentStyle={{ borderRadius: 12, border: "1px solid #d4dce8" }}
          />
          <Legend />
          <Bar dataKey="cost" stackId="tot" name="Costo" fill="#f97316" radius={[3, 3, 0, 0]} />
          <Bar dataKey="vat" stackId="tot" name="IVA" fill="#3b82f6" />
          <Bar dataKey="excise" stackId="tot" name="Accisa" fill="#a855f7" />
          <Bar dataKey="margin" stackId="tot" name="Margine" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const ITALY_REGIONS = [
  { key: "Valle d'Aosta", lat: 45.74, lng: 7.32 },
  { key: "Piemonte", lat: 45.07, lng: 7.69 },
  { key: "Liguria", lat: 44.41, lng: 8.93 },
  { key: "Lombardia", lat: 45.46, lng: 9.19 },
  { key: "Trentino-Alto Adige", lat: 46.50, lng: 11.35 },
  { key: "Veneto", lat: 45.44, lng: 12.33 },
  { key: "Friuli-Venezia Giulia", lat: 45.65, lng: 13.77 },
  { key: "Emilia-Romagna", lat: 44.49, lng: 11.34 },
  { key: "Toscana", lat: 43.77, lng: 11.25 },
  { key: "Umbria", lat: 43.11, lng: 12.39 },
  { key: "Marche", lat: 43.62, lng: 13.51 },
  { key: "Lazio", lat: 41.90, lng: 12.50 },
  { key: "Abruzzo", lat: 42.35, lng: 13.40 },
  { key: "Molise", lat: 41.56, lng: 14.66 },
  { key: "Campania", lat: 40.85, lng: 14.27 },
  { key: "Puglia", lat: 41.12, lng: 16.87 },
  { key: "Basilicata", lat: 40.64, lng: 15.80 },
  { key: "Calabria", lat: 38.91, lng: 16.59 },
  { key: "Sicilia", lat: 38.12, lng: 13.36 },
  { key: "Sardegna", lat: 39.22, lng: 9.12 },
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
        <MapContainer center={[42.5, 12.5]} zoom={5.6} minZoom={5} maxZoom={8} className="italy-leaflet-map" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data
            .filter((region) => region.revenue > 0)
            .map((region) => {
              const intensity = Math.max(region.revenue / max, 0);
              const radius = 6 + intensity * 16;
              return (
                <CircleMarker
                  key={region.key}
                  center={[region.lat, region.lng]}
                  radius={radius}
                  pathOptions={{
                    fillColor: "#0ea5e9",
                    color: "#0369a1",
                    weight: 1.2,
                    fillOpacity: 0.45 + intensity * 0.35,
                  }}
                  eventHandlers={{
                    mouseover: () => setActive(region),
                    mouseout: () => setActive(null),
                    click: () => setActive(region),
                  }}
                >
                  <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95}>
                    <strong>{region.key}</strong><br />
                    Ordini: {region.orders}<br />
                    Fatturato: {formatMoney(region.revenue)}
                  </LeafletTooltip>
                </CircleMarker>
              );
            })}
        </MapContainer>
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
  const ordersSeries = data.daily.map((d) => ({ label: d.date, value: d.orders }));
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
              <h2>Trend vendite (stile dashboard)</h2>
              <div className="muted">Barre ordini + linea fatturato</div>
            </div>
          </div>
          <div className="chart-stack combo-stack">
            <ComboBarLineChart bars={ordersSeries} line={revenueSeries} />
            <div className="spark-legend">
              <span><i className="legend-dot revenue" /> Fatturato</span>
              <span><i className="legend-dot orders" /> Ordini</span>
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
          <div className="trend-cashflow">
            <TrendChart series={cashflowSeries} variant="area" />
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
