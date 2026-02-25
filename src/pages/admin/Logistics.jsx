import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const STATUS = ["DRAFT", "READY", "SHIPPED", "DELIVERED", "EXCEPTION"];

export default function AdminLogistics() {
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [q, setQ] = useState("");
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
    <section>
      <div className="page-header">
        <div>
          <h1>Logistica</h1>
          <p>Gestione spedizioni ecommerce (tracking, stato, note)</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards">
        {STATUS.map((s) => (
          <div className="card" key={s}>
            <div className="card-label">{s}</div>
            <div className="card-value">{counts.get(s) || 0}</div>
          </div>
        ))}
      </div>

      <div className="panel form-grid" style={{ marginTop: 12 }}>
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
        <label>Corriere<input value={draft.carrier} onChange={(e) => setDraft((p) => ({ ...p, carrier: e.target.value }))} /></label>
        <label>Tracking<input value={draft.trackingCode} onChange={(e) => setDraft((p) => ({ ...p, trackingCode: e.target.value }))} /></label>
        <label>
          Stato
          <select className="select" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
            {STATUS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>Data spedizione<input type="date" value={draft.shippingDate} onChange={(e) => setDraft((p) => ({ ...p, shippingDate: e.target.value }))} /></label>
        <label>Data consegna<input type="date" value={draft.deliveredAt} onChange={(e) => setDraft((p) => ({ ...p, deliveredAt: e.target.value }))} /></label>
        <label className="full">Note<input value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} /></label>
        <div className="actions"><button className="btn primary" onClick={createShipment}>Crea spedizione</button></div>
      </div>

      <div className="filters-row">
        <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div className="filter-group"><label>Stato</label><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tutti</option>{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="filter-group"><label>Corriere</label><input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></div>
        <div className="filter-group" style={{ minWidth: 260 }}><label>Ricerca</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="tracking, note, cliente" /></div>
      </div>

      <div className="table wide-report">
        <div className="row header"><div>Data</div><div>Ordine</div><div>Cliente</div><div>Corriere</div><div>Tracking</div><div>Stato</div><div>Spedizione</div><div>Consegna</div><div>Azioni</div></div>
        {rows.map((r) => (
          <div className="row" key={r.id}>
            <div>{new Date(r.createdAt).toLocaleDateString("it-IT")}</div>
            <div className="mono">{r.order?.orderNumber ? `#${r.order.orderNumber}` : "-"}</div>
            <div>{r.order?.company?.name || "-"}</div>
            <div>{r.carrier || "-"}</div>
            <div className="mono">{r.trackingCode || "-"}</div>
            <div>{r.status}</div>
            <div>{r.shippingDate ? new Date(r.shippingDate).toLocaleDateString("it-IT") : "-"}</div>
            <div>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString("it-IT") : "-"}</div>
            <div className="actions">
              <select className="select" value={r.status} onChange={(e) => updateStatus(r, e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
