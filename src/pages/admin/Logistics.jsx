import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const STATUS = ["DRAFT", "READY", "SHIPPED", "DELIVERED", "EXCEPTION"];
const STATUS_LABELS = {
  DRAFT: "Bozza",
  READY: "Pronto",
  SHIPPED: "Spedito",
  DELIVERED: "Consegnato",
  EXCEPTION: "Eccezione",
};

export default function AdminLogistics() {
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draft, setDraft] = useState({
    orderId: "",
    carrier: "",
    trackingCode: "",
    status: "DRAFT",
    shippingDate: "",
    deliveredAt: "",
    notes: "",
  });

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      if (status) params.set("status", status);
      if (carrier) params.set("carrier", carrier);
      if (q) params.set("q", q);
      const res = await api(`/admin/logistics/shipments?${params.toString()}`);
      setRows(res || []);
      setError("");
    } catch {
      setError("Impossibile caricare spedizioni");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate, status, carrier, q]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/admin/orders?status=APPROVED");
        setOrders(res || []);
      } catch {
        setOrders([]);
      }
    })();
  }, []);

  async function createShipment() {
    try {
      await api("/admin/logistics/shipments", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setDraft({
        orderId: "",
        carrier: "",
        trackingCode: "",
        status: "DRAFT",
        shippingDate: "",
        deliveredAt: "",
        notes: "",
      });
      await load();
    } catch {
      setError("Impossibile creare spedizione");
    }
  }

  async function updateStatus(row, nextStatus) {
    try {
      await api(`/admin/logistics/shipments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch {
      setError("Impossibile aggiornare spedizione");
    }
  }

  const counts = useMemo(() => {
    const map = new Map();
    for (const s of STATUS) map.set(s, 0);
    for (const r of rows) map.set(r.status, (map.get(r.status) || 0) + 1);
    return map;
  }, [rows]);

  return (
    <section className="logistics-page">
      <div className="page-header">
        <div>
          <h1>Logistica</h1>
          <p>Gestione spedizioni ecommerce (tracking, stato, note)</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? "Chiudi creazione" : "Nuova spedizione"}
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards logistics-cards">
        {STATUS.map((s) => (
          <div className="card" key={s}>
            <div className="card-label">{STATUS_LABELS[s]}</div>
            <div className="card-value">{counts.get(s) || 0}</div>
          </div>
        ))}
      </div>

      {showCreateForm ? (
        <div className="panel logistics-create-panel">
          <div className="panel-header-compact">
            <h3>Nuova spedizione</h3>
          </div>
          <div className="form-grid logistics-create-grid">
            <label>
              Ordine
              <select className="select" value={draft.orderId} onChange={(e) => setDraft((p) => ({ ...p, orderId: e.target.value }))}>
                <option value="">Nessuno</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNumber} · {o.company?.name || "Cliente"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Corriere
              <input value={draft.carrier} onChange={(e) => setDraft((p) => ({ ...p, carrier: e.target.value }))} />
            </label>
            <label>
              Tracking
              <input value={draft.trackingCode} onChange={(e) => setDraft((p) => ({ ...p, trackingCode: e.target.value }))} />
            </label>
            <label>
              Stato
              <select className="select" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                {STATUS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label>
              Data spedizione
              <input type="date" value={draft.shippingDate} onChange={(e) => setDraft((p) => ({ ...p, shippingDate: e.target.value }))} />
            </label>
            <label>
              Data consegna
              <input type="date" value={draft.deliveredAt} onChange={(e) => setDraft((p) => ({ ...p, deliveredAt: e.target.value }))} />
            </label>
            <label className="full">
              Note
              <input value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setShowCreateForm(false)}>Annulla</button>
            <button className="btn primary" onClick={createShipment}>Crea spedizione</button>
          </div>
        </div>
      ) : null}

      <div className="logistics-filters-shell">
        <div className="logistics-filters-top">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca tracking, note, cliente, ordine..." />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setStatus("");
              setCarrier("");
              setQ("");
            }}
          >
            Reset filtri
          </button>
        </div>
        <div className="filters-row logistics-filters-grid">
          <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="filter-group"><label>Stato</label><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tutti</option>{STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
          <div className="filter-group"><label>Corriere</label><input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></div>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="table wide-report logistics-table-pro">
          <div className="row header"><div>Data</div><div>Ordine</div><div>Cliente</div><div>Corriere</div><div>Tracking</div><div>Stato</div><div>Spedizione</div><div>Consegna</div><div>Azioni</div></div>
          {rows.map((r) => (
            <div className="row" key={r.id}>
              <div>{new Date(r.createdAt).toLocaleDateString("it-IT")}</div>
              <div className="mono">{r.order?.orderNumber ? `#${r.order.orderNumber}` : "-"}</div>
              <div>{r.order?.company?.name || "-"}</div>
              <div>{r.carrier || "-"}</div>
              <div className="mono">{r.trackingCode || "-"}</div>
              <div><span className={`tag ${r.status === "EXCEPTION" ? "danger" : r.status === "DELIVERED" ? "success" : "info"}`}>{STATUS_LABELS[r.status] || r.status}</span></div>
              <div>{r.shippingDate ? new Date(r.shippingDate).toLocaleDateString("it-IT") : "-"}</div>
              <div>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString("it-IT") : "-"}</div>
              <div className="actions">
                <select className="select" value={r.status} onChange={(e) => updateStatus(r, e.target.value)}>
                  {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="logistics-cards-grid">
          {rows.map((r) => (
            <article className="logistics-card" key={r.id}>
              <div className="logistics-card-top">
                <strong className="mono">{r.order?.orderNumber ? `#${r.order.orderNumber}` : "-"}</strong>
                <span className={`tag ${r.status === "EXCEPTION" ? "danger" : r.status === "DELIVERED" ? "success" : "info"}`}>{STATUS_LABELS[r.status] || r.status}</span>
              </div>
              <strong>{r.order?.company?.name || "-"}</strong>
              <div className="muted">{r.carrier || "-"} · {r.trackingCode || "-"}</div>
              <div className="logistics-card-grid">
                <span>Creata: <strong>{new Date(r.createdAt).toLocaleDateString("it-IT")}</strong></span>
                <span>Spedita: <strong>{r.shippingDate ? new Date(r.shippingDate).toLocaleDateString("it-IT") : "-"}</strong></span>
                <span>Consegnata: <strong>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString("it-IT") : "-"}</strong></span>
              </div>
              <select className="select" value={r.status} onChange={(e) => updateStatus(r, e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
