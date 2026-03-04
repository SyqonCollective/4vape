import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const STATUS = ["DRAFT", "READY", "SHIPPED", "DELIVERED", "EXCEPTION"];
const STATUS_LABELS = {
  DRAFT: "Bozza",
  READY: "Pronto",
  SHIPPED: "Spedito",
  DELIVERED: "Consegnato",
  EXCEPTION: "Eccezione",
};
const STATUS_TAG = {
  DRAFT: "info",
  READY: "warn",
  SHIPPED: "info",
  DELIVERED: "success",
  EXCEPTION: "danger",
};

export default function AdminLogistics() {
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [brtStatus, setBrtStatus] = useState(null);
  const [trackingAll, setTrackingAll] = useState(false);

  // Create BRT shipment modal
  const [showBrtModal, setShowBrtModal] = useState(false);
  const [brtDraft, setBrtDraft] = useState({
    orderId: "",
    numberOfParcels: 1,
    weightKG: 1,
    volumeM3: "",
    serviceType: "",
    deliveryFreightTypeCode: "DAP",
    cashOnDelivery: "",
    insuranceAmount: "",
    notes: "",
    isAlertRequired: true,
  });
  const [creating, setCreating] = useState(false);

  // Manual create (no BRT)
  const [showManual, setShowManual] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    orderId: "",
    carrier: "BRT",
    trackingCode: "",
    status: "DRAFT",
    shippingDate: "",
    deliveredAt: "",
    notes: "",
  });

  // Tracking detail modal
  const [trackDetail, setTrackDetail] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);

  // Edit shipment
  const [editRow, setEditRow] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const load = useCallback(async () => {
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
  }, [startDate, endDate, status, carrier, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [ordRes, brtRes] = await Promise.all([
          api("/admin/orders?status=APPROVED"),
          api("/admin/logistics/brt/status"),
        ]);
        setOrders(ordRes || []);
        setBrtStatus(brtRes);
      } catch {
        setOrders([]);
      }
    })();
  }, []);

  // Auto-open BRT modal when navigating from Orders with orderId
  useEffect(() => {
    if (location.state?.orderId && orders.length) {
      setBrtDraft((p) => ({ ...p, orderId: location.state.orderId }));
      setShowBrtModal(true);
      // Clear location state to avoid re-triggering
      window.history.replaceState({}, "");
    }
  }, [location.state, orders]);

  // BRT Create
  async function createBrtShipment() {
    if (!brtDraft.orderId) return;
    setCreating(true);
    setError("");
    try {
      const payload = {
        orderId: brtDraft.orderId,
        numberOfParcels: brtDraft.numberOfParcels,
        weightKG: brtDraft.weightKG,
        serviceType: brtDraft.serviceType,
        deliveryFreightTypeCode: brtDraft.deliveryFreightTypeCode,
        isAlertRequired: brtDraft.isAlertRequired,
        notes: brtDraft.notes || undefined,
      };
      if (brtDraft.volumeM3) payload.volumeM3 = parseFloat(brtDraft.volumeM3);
      if (brtDraft.cashOnDelivery) payload.cashOnDelivery = parseFloat(brtDraft.cashOnDelivery);
      if (brtDraft.insuranceAmount) payload.insuranceAmount = parseFloat(brtDraft.insuranceAmount);

      const res = await api("/admin/logistics/brt/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess(`Spedizione BRT creata! Tracking: ${res.brtResponse?.trackingId || res.shipment?.trackingCode || "-"}`);
      setTimeout(() => setSuccess(""), 5000);
      setShowBrtModal(false);
      setBrtDraft({ orderId: "", numberOfParcels: 1, weightKG: 1, volumeM3: "", serviceType: "", deliveryFreightTypeCode: "DAP", cashOnDelivery: "", insuranceAmount: "", notes: "", isAlertRequired: true });
      const ordRes = await api("/admin/orders?status=APPROVED");
      setOrders(ordRes || []);
      await load();
    } catch (err) {
      const msg = err?.message || "";
      try { const p = JSON.parse(msg); setError(p?.error || "Errore creazione BRT"); } catch { setError(msg || "Errore creazione BRT"); }
    } finally {
      setCreating(false);
    }
  }

  // Manual Create
  async function createManual() {
    try {
      await api("/admin/logistics/shipments", { method: "POST", body: JSON.stringify(manualDraft) });
      setManualDraft({ orderId: "", carrier: "BRT", trackingCode: "", status: "DRAFT", shippingDate: "", deliveredAt: "", notes: "" });
      setShowManual(false);
      await load();
    } catch {
      setError("Errore creazione spedizione manuale");
    }
  }

  // Track single
  async function trackShipment(row) {
    if (!row.brtTrackingId && !row.brtParcelId) {
      setError("Nessun ID tracking BRT per questa spedizione");
      return;
    }
    setTrackLoading(true);
    try {
      const res = await api(`/admin/logistics/brt/track/${row.id}`);
      setTrackDetail({ shipment: row, ...res.tracking });
      await load();
    } catch (err) {
      const msg = err?.message || "";
      try { const p = JSON.parse(msg); setError(p?.error || "Errore tracking"); } catch { setError(msg || "Errore tracking"); }
    } finally {
      setTrackLoading(false);
    }
  }

  // Track all
  async function trackAll() {
    setTrackingAll(true);
    try {
      const res = await api("/admin/logistics/brt/track-all", { method: "POST" });
      setSuccess(`Tracking aggiornato per ${res.tracked} spedizioni`);
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch {
      setError("Errore aggiornamento tracking massivo");
    } finally {
      setTrackingAll(false);
    }
  }

  // Cancel BRT
  async function cancelBrt(row) {
    if (!confirm(`Annullare la spedizione BRT per ordine #${row.order?.orderNumber || "-"}?`)) return;
    try {
      await api(`/admin/logistics/brt/delete/${row.id}`, { method: "POST" });
      setSuccess("Spedizione BRT annullata");
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch (err) {
      const msg = err?.message || "";
      try { const p = JSON.parse(msg); setError(p?.error || "Errore annullamento"); } catch { setError(msg || "Errore annullamento"); }
    }
  }

  // Download label
  function downloadLabel(row) {
    window.open(`/api/admin/logistics/brt/label/${row.id}`, "_blank");
  }

  // Update status
  async function updateStatus(row, nextStatus) {
    try {
      await api(`/admin/logistics/shipments/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch {
      setError("Errore aggiornamento stato");
    }
  }

  // Edit
  function openEdit(row) {
    setEditRow(row);
    setEditDraft({
      carrier: row.carrier || "",
      trackingCode: row.trackingCode || "",
      notes: row.notes || "",
      shippingDate: row.shippingDate ? row.shippingDate.slice(0, 10) : "",
      deliveredAt: row.deliveredAt ? row.deliveredAt.slice(0, 10) : "",
    });
  }
  async function saveEdit() {
    if (!editRow) return;
    try {
      await api(`/admin/logistics/shipments/${editRow.id}`, { method: "PATCH", body: JSON.stringify(editDraft) });
      setEditRow(null);
      await load();
    } catch {
      setError("Errore salvataggio");
    }
  }

  const counts = useMemo(() => {
    const map = new Map();
    for (const s of STATUS) map.set(s, 0);
    for (const r of rows) map.set(r.status, (map.get(r.status) || 0) + 1);
    return map;
  }, [rows]);

  const selectedOrder = orders.find((o) => o.id === brtDraft.orderId);

  return (
    <section className="logistics-page">
      <div className="page-header">
        <div>
          <h1>Logistica</h1>
          <p>Gestione spedizioni BRT &mdash; creazione, tracking, etichette, contrassegno</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowBrtModal(true)}>
            Spedisci con BRT
          </button>
          <button className="btn ghost" onClick={() => setShowManual((v) => !v)}>
            + Manuale
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: "10px 16px", borderRadius: 8, marginBottom: 14, fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* BRT Status bar */}
      {brtStatus && (
        <div className="panel" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>BRT:</strong>
            <span className={`tag ${brtStatus.configured ? "success" : "danger"}`}>
              {brtStatus.configured ? "Configurato" : "Non configurato"}
            </span>
            {brtStatus.senderCompanyName && <span className="muted">{brtStatus.senderCompanyName}</span>}
            {brtStatus.departureDepot ? <span className="muted">Filiale: {brtStatus.departureDepot}</span> : null}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn ghost small" onClick={trackAll} disabled={trackingAll}>
              {trackingAll ? "Aggiornamento..." : "Aggiorna tracking"}
            </button>
            <button className="btn ghost small" onClick={load}>Ricarica</button>
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className="cards logistics-cards">
        {STATUS.map((s) => (
          <div className={`card${status === s ? " active" : ""}`} key={s} onClick={() => setStatus(status === s ? "" : s)} style={{ cursor: "pointer" }}>
            <div className="card-label">{STATUS_LABELS[s]}</div>
            <div className="card-value">{counts.get(s) || 0}</div>
          </div>
        ))}
        <div className={`card${!status ? " active" : ""}`} onClick={() => setStatus("")} style={{ cursor: "pointer" }}>
          <div className="card-label">Tutte</div>
          <div className="card-value">{rows.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="inv-toolbar-row" style={{ marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca tracking, cliente, ordine..." style={{ maxWidth: 250 }} />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Data dal" style={{ maxWidth: 140 }} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Data al" style={{ maxWidth: 140 }} />
        <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)} style={{ maxWidth: 120 }}>
          <option value="">Corriere</option>
          <option value="BRT">BRT</option>
          <option value="DHL">DHL</option>
          <option value="GLS">GLS</option>
          <option value="SDA">SDA</option>
        </select>
        <div className="products-view-switch">
          <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
          <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
        </div>
        <button className="btn ghost" onClick={() => { setStartDate(""); setEndDate(""); setStatus(""); setCarrier(""); setQ(""); }}>Reset</button>
      </div>

      {/* Manual create form */}
      {showManual && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Spedizione manuale (senza integrazione BRT)</h3>
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            <label>
              Ordine
              <select className="select" value={manualDraft.orderId} onChange={(e) => setManualDraft((p) => ({ ...p, orderId: e.target.value }))}>
                <option value="">Nessuno</option>
                {orders.map((o) => <option key={o.id} value={o.id}>#{o.orderNumber} · {o.company?.name || "Cliente"}</option>)}
              </select>
            </label>
            <label>Corriere<input value={manualDraft.carrier} onChange={(e) => setManualDraft((p) => ({ ...p, carrier: e.target.value }))} /></label>
            <label>Tracking<input value={manualDraft.trackingCode} onChange={(e) => setManualDraft((p) => ({ ...p, trackingCode: e.target.value }))} /></label>
            <label>
              Stato
              <select className="select" value={manualDraft.status} onChange={(e) => setManualDraft((p) => ({ ...p, status: e.target.value }))}>
                {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label>Data spedizione<input type="date" value={manualDraft.shippingDate} onChange={(e) => setManualDraft((p) => ({ ...p, shippingDate: e.target.value }))} /></label>
            <label>Note<input value={manualDraft.notes} onChange={(e) => setManualDraft((p) => ({ ...p, notes: e.target.value }))} /></label>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setShowManual(false)}>Annulla</button>
            <button className="btn primary" onClick={createManual}>Crea</button>
          </div>
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" ? (
        <div className="table wide-report">
          <div className="row header">
            <div>Data</div><div>Ordine</div><div>Cliente</div><div>Corriere</div><div>Tracking</div><div>Stato</div><div>Ultimo evento</div><div>Colli</div><div>Peso</div><div>Azioni</div>
          </div>
          {rows.map((r) => (
            <div className="row" key={r.id}>
              <div>{new Date(r.createdAt).toLocaleDateString("it-IT")}</div>
              <div className="mono">{r.order?.orderNumber ? `#${r.order.orderNumber}` : "-"}</div>
              <div>{r.order?.company?.name || "-"}</div>
              <div>{r.carrier || "-"}</div>
              <div className="mono" style={{ fontSize: 12 }}>{r.trackingCode || "-"}</div>
              <div>
                <span className={`tag ${STATUS_TAG[r.status] || "info"}`}>{STATUS_LABELS[r.status] || r.status}</span>
              </div>
              <div style={{ fontSize: 12 }}>{r.brtLastEvent || "-"}</div>
              <div>{r.brtNumberOfParcels || "-"}</div>
              <div>{r.brtWeightKG ? `${r.brtWeightKG} kg` : "-"}</div>
              <div className="inv-actions">
                {r.carrier === "BRT" && r.brtParcelId && (
                  <>
                    <button className="btn ghost" onClick={() => trackShipment(r)} disabled={trackLoading} title="Aggiorna tracking">📍</button>
                    <button className="btn ghost" onClick={() => downloadLabel(r)} title="Etichetta PDF">🏷️</button>
                    {(r.status === "DRAFT" || r.status === "READY") && (
                      <button className="btn ghost" onClick={() => cancelBrt(r)} title="Annulla BRT">❌</button>
                    )}
                  </>
                )}
                <button className="btn ghost" onClick={() => openEdit(r)} title="Modifica">✏️</button>
                <select className="select" value={r.status} onChange={(e) => updateStatus(r, e.target.value)} style={{ width: 100, fontSize: 11 }}>
                  {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="row muted" style={{ justifyContent: "center", padding: 24 }}>Nessuna spedizione trovata</div>}
        </div>
      ) : (
        <div className="logistics-cards-grid">
          {rows.map((r) => (
            <article className="logistics-card" key={r.id}>
              <div className="logistics-card-top">
                <strong className="mono">{r.order?.orderNumber ? `#${r.order.orderNumber}` : "-"}</strong>
                <span className={`tag ${STATUS_TAG[r.status] || "info"}`}>{STATUS_LABELS[r.status] || r.status}</span>
              </div>
              <strong>{r.order?.company?.name || "-"}</strong>
              <div className="muted">{r.carrier || "-"} · {r.trackingCode || "-"}</div>
              {r.brtLastEvent && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>📍 {r.brtLastEvent}</div>}
              <div className="logistics-card-grid">
                <span>Colli: <strong>{r.brtNumberOfParcels || "-"}</strong></span>
                <span>Peso: <strong>{r.brtWeightKG ? `${r.brtWeightKG} kg` : "-"}</strong></span>
                <span>Spedita: <strong>{r.shippingDate ? new Date(r.shippingDate).toLocaleDateString("it-IT") : "-"}</strong></span>
                <span>Consegnata: <strong>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString("it-IT") : "-"}</strong></span>
              </div>
              {r.brtCodAmount && parseFloat(r.brtCodAmount) > 0 ? (
                <div style={{ fontSize: 12, color: "#b45309" }}>💰 Contrassegno: €{parseFloat(r.brtCodAmount).toFixed(2)}</div>
              ) : null}
              <div className="inv-actions" style={{ marginTop: 8 }}>
                {r.carrier === "BRT" && r.brtParcelId && (
                  <>
                    <button className="btn ghost" onClick={() => trackShipment(r)}>📍 Track</button>
                    <button className="btn ghost" onClick={() => downloadLabel(r)}>🏷️ Etichetta</button>
                    {(r.status === "DRAFT" || r.status === "READY") && (
                      <button className="btn ghost" onClick={() => cancelBrt(r)}>❌ Annulla</button>
                    )}
                  </>
                )}
                <button className="btn ghost" onClick={() => openEdit(r)}>✏️</button>
                <select className="select" value={r.status} onChange={(e) => updateStatus(r, e.target.value)} style={{ fontSize: 11 }}>
                  {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* BRT Create Shipment Modal */}
      {showBrtModal && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowBrtModal(false)}>
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <h3>Spedisci con BRT</h3>
                <button className="btn ghost" onClick={() => setShowBrtModal(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                {!brtStatus?.configured && (
                  <div style={{ background: "#fef2f2", color: "#991b1b", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                    BRT non configurato. Aggiungi nel <code>.env</code>: BRT_USER_ID, BRT_PASSWORD, BRT_DEPARTURE_DEPOT, BRT_SENDER_CUSTOMER_CODE
                  </div>
                )}

                <label>
                  Ordine da spedire *
                  <select className="select" value={brtDraft.orderId} onChange={(e) => setBrtDraft((p) => ({ ...p, orderId: e.target.value }))}>
                    <option value="">Seleziona ordine approvato...</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>#{o.orderNumber} · {o.company?.name || "Cliente"} · €{parseFloat(o.total).toFixed(2)}</option>
                    ))}
                  </select>
                </label>

                {selectedOrder && (
                  <div style={{ background: "#f0f9ff", padding: "10px 14px", borderRadius: 8, margin: "12px 0", fontSize: 13 }}>
                    <strong>{selectedOrder.company?.name}</strong><br />
                    {selectedOrder.company?.address}, {selectedOrder.company?.cap} {selectedOrder.company?.city} ({selectedOrder.company?.province})<br />
                    {selectedOrder.company?.phone && <>Tel: {selectedOrder.company.phone}<br /></>}
                    {selectedOrder.company?.email && <>Email: {selectedOrder.company.email}<br /></>}
                    <strong>Totale ordine: €{parseFloat(selectedOrder.total).toFixed(2)}</strong>
                    {selectedOrder.paymentMethod === "COD" && <span style={{ color: "#b45309", marginLeft: 8 }}>💰 Contrassegno</span>}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label>
                    Numero colli *
                    <input type="number" min={1} max={30} value={brtDraft.numberOfParcels} onChange={(e) => setBrtDraft((p) => ({ ...p, numberOfParcels: parseInt(e.target.value) || 1 }))} />
                  </label>
                  <label>
                    Peso (kg) *
                    <input type="number" min={0.1} step={0.1} value={brtDraft.weightKG} onChange={(e) => setBrtDraft((p) => ({ ...p, weightKG: parseFloat(e.target.value) || 1 }))} />
                  </label>
                  <label>
                    Volume (m³)
                    <input type="number" step={0.001} value={brtDraft.volumeM3} onChange={(e) => setBrtDraft((p) => ({ ...p, volumeM3: e.target.value }))} placeholder="Opzionale" />
                  </label>
                  <label>
                    Servizio
                    <select className="select" value={brtDraft.serviceType} onChange={(e) => setBrtDraft((p) => ({ ...p, serviceType: e.target.value }))}>
                      <option value="">Standard</option>
                      <option value="E">Priority</option>
                      <option value="H">Express 10:30</option>
                    </select>
                  </label>
                  <label>
                    Porto
                    <select className="select" value={brtDraft.deliveryFreightTypeCode} onChange={(e) => setBrtDraft((p) => ({ ...p, deliveryFreightTypeCode: e.target.value }))}>
                      <option value="DAP">Franco (DAP)</option>
                      <option value="EXW">Assegnato (EXW)</option>
                    </select>
                  </label>
                  <label>
                    Contrassegno (€)
                    <input
                      type="number"
                      step={0.01}
                      value={brtDraft.cashOnDelivery}
                      onChange={(e) => setBrtDraft((p) => ({ ...p, cashOnDelivery: e.target.value }))}
                      placeholder={selectedOrder?.paymentMethod === "COD" ? parseFloat(selectedOrder.total).toFixed(2) : "0"}
                    />
                  </label>
                  <label>
                    Assicurazione (€)
                    <input type="number" step={0.01} value={brtDraft.insuranceAmount} onChange={(e) => setBrtDraft((p) => ({ ...p, insuranceAmount: e.target.value }))} placeholder="Opzionale" />
                  </label>
                  <label className="checkbox-row" style={{ alignSelf: "end" }}>
                    <input type="checkbox" checked={brtDraft.isAlertRequired} onChange={(e) => setBrtDraft((p) => ({ ...p, isAlertRequired: e.target.checked }))} />
                    Invia alert al destinatario
                  </label>
                </div>

                <label style={{ marginTop: 12 }}>
                  Note
                  <input value={brtDraft.notes} onChange={(e) => setBrtDraft((p) => ({ ...p, notes: e.target.value }))} placeholder="Note interne" />
                </label>

                <div className="actions" style={{ marginTop: 20 }}>
                  <button className="btn ghost" onClick={() => setShowBrtModal(false)}>Annulla</button>
                  <button className="btn primary" onClick={createBrtShipment} disabled={creating || !brtDraft.orderId || !brtStatus?.configured}>
                    {creating ? "Creazione in corso..." : "Crea spedizione BRT"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Tracking Detail Modal */}
      {trackDetail && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setTrackDetail(null)}>
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
              <div className="modal-header">
                <h3>Tracking BRT &mdash; {trackDetail.shipment?.trackingCode || ""}</h3>
                <button className="btn ghost" onClick={() => setTrackDetail(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, fontSize: 13 }}>
                  <div><strong>Stato:</strong> {trackDetail.datiSpedizione?.descrizione_stato_sped_parte1 || trackDetail.datiSpedizione?.stato_sped_parte1 || "-"}</div>
                  <div><strong>Filiale arrivo:</strong> {trackDetail.datiSpedizione?.filiale_arrivo || "-"}</div>
                  <div><strong>Servizio:</strong> {trackDetail.datiSpedizione?.servizio || trackDetail.datiSpedizione?.tipo_servizio || "-"}</div>
                  <div><strong>Porto:</strong> {trackDetail.datiSpedizione?.porto || "-"}</div>
                </div>

                {trackDetail.datiConsegna && (
                  <div style={{ background: "#f0fdf4", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                    <strong>Consegna</strong><br />
                    {trackDetail.datiConsegna.data_consegna_merce ? (
                      <span style={{ color: "#15803d" }}>Consegnato il {trackDetail.datiConsegna.data_consegna_merce} alle {trackDetail.datiConsegna.ora_consegna_merce || ""} — Firma: {trackDetail.datiConsegna.firmatario_consegna || "-"}</span>
                    ) : (
                      <span>Consegna prevista: {trackDetail.datiConsegna.data_teorica_consegna || "-"} {trackDetail.datiConsegna.ora_teorica_consegna_da && `dalle ${trackDetail.datiConsegna.ora_teorica_consegna_da} alle ${trackDetail.datiConsegna.ora_teorica_consegna_a}`}</span>
                    )}
                  </div>
                )}

                {trackDetail.recapito_dest && (
                  <div style={{ fontSize: 13, marginBottom: 16 }}>
                    <strong>Destinatario:</strong> {trackDetail.recapito_dest.nome || ""} — {trackDetail.recapito_dest.indirizzo || ""}, {trackDetail.recapito_dest.cap || ""} {trackDetail.recapito_dest.localita || ""} ({trackDetail.recapito_dest.provincia || ""})
                  </div>
                )}

                <h4 style={{ marginBottom: 8 }}>Eventi</h4>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {(Array.isArray(trackDetail.eventi) ? trackDetail.eventi : []).map((ev, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #e2e8f0", fontSize: 13 }}>
                      <div style={{ minWidth: 90, color: "#64748b" }}>{ev.data || ""}<br />{ev.ora || ""}</div>
                      <div>
                        <strong>{ev.descrizione || ev.desc || "-"}</strong>
                        {ev.filiale && <div className="muted">{ev.filiale}</div>}
                      </div>
                    </div>
                  ))}
                  {(!trackDetail.eventi || trackDetail.eventi.length === 0) && (
                    <div className="muted" style={{ padding: 16, textAlign: "center" }}>Nessun evento disponibile</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Edit Modal */}
      {editRow && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setEditRow(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h3>Modifica spedizione</h3>
                <button className="btn ghost" onClick={() => setEditRow(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <label>Corriere<input value={editDraft.carrier} onChange={(e) => setEditDraft((p) => ({ ...p, carrier: e.target.value }))} /></label>
                <label>Tracking<input value={editDraft.trackingCode} onChange={(e) => setEditDraft((p) => ({ ...p, trackingCode: e.target.value }))} /></label>
                <label>Data spedizione<input type="date" value={editDraft.shippingDate} onChange={(e) => setEditDraft((p) => ({ ...p, shippingDate: e.target.value }))} /></label>
                <label>Data consegna<input type="date" value={editDraft.deliveredAt} onChange={(e) => setEditDraft((p) => ({ ...p, deliveredAt: e.target.value }))} /></label>
                <label>Note<input value={editDraft.notes} onChange={(e) => setEditDraft((p) => ({ ...p, notes: e.target.value }))} /></label>
                <div className="actions" style={{ marginTop: 16 }}>
                  <button className="btn ghost" onClick={() => setEditRow(null)}>Annulla</button>
                  <button className="btn primary" onClick={saveEdit}>Salva</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Info panel */}
      <div className="panel" style={{ background: "#f0f9ff", border: "1px solid #bae6fd", marginTop: 20 }}>
        <h3 style={{ margin: "0 0 8px", color: "#0369a1" }}>Integrazione BRT</h3>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: "#334155", fontSize: 14 }}>
          <li><strong>Spedisci con BRT</strong> &mdash; seleziona un ordine approvato, imposta colli/peso, e la spedizione viene creata automaticamente su BRT con etichetta PDF</li>
          <li><strong>Tracking in tempo reale</strong> &mdash; aggiorna stato, eventi e data consegna direttamente dalle API BRT</li>
          <li><strong>Etichette PDF</strong> &mdash; scaricabili e stampabili, generate automaticamente da BRT</li>
          <li><strong>Contrassegno</strong> &mdash; supporto completo per ordini con pagamento alla consegna</li>
          <li><strong>Annullamento</strong> &mdash; annulla spedizioni BRT non ancora prese in carico dalla filiale</li>
          <li><strong>Aggiornamento massivo</strong> &mdash; aggiorna il tracking di tutte le spedizioni attive in un click</li>
        </ul>
        {!brtStatus?.configured && (
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Per attivare BRT, aggiungi nel file <code>.env</code> del backend:<br />
            <code>BRT_USER_ID=tuo_user_id</code> (fornito da BRT)<br />
            <code>BRT_PASSWORD=tua_password</code> (fornita da BRT)<br />
            <code>BRT_DEPARTURE_DEPOT=numero_filiale</code> (es. 170)<br />
            <code>BRT_SENDER_CUSTOMER_CODE=codice_cliente</code> (es. 1234567)<br />
            <code>BRT_SENDER_COMPANY_NAME=Logistica Salentina S.r.l.s.</code>
          </div>
        )}
      </div>
    </section>
  );
}
