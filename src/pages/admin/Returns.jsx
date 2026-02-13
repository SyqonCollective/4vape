import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const STATUS_META = {
  PENDING: { label: "Da gestire", cls: "warning" },
  HANDLED: { label: "Gestito", cls: "success" },
};

export default function AdminReturns() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [confirmHandle, setConfirmHandle] = useState(null);

  async function loadReturns() {
    try {
      const res = await api("/admin/returns?status=ALL");
      setItems(res || []);
    } catch {
      setError("Impossibile caricare resi");
    }
  }

  useEffect(() => {
    loadReturns();
  }, []);

  const filteredItems = useMemo(
    () => items.filter((x) => (status === "ALL" ? true : x.status === status)),
    [items, status]
  );

  const stats = useMemo(() => {
    const pending = items.filter((x) => x.status === "PENDING").length;
    const handled = items.filter((x) => x.status === "HANDLED").length;
    return { total: items.length, pending, handled };
  }, [items]);

  async function openDetail(id) {
    try {
      const res = await api(`/admin/returns/${id}`);
      setDetail(res);
    } catch {
      setError("Impossibile caricare dettaglio reso");
    }
  }

  async function markHandled(id) {
    try {
      await api(`/admin/returns/${id}/handle`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      setConfirmHandle(null);
      setDetail(null);
      await loadReturns();
    } catch {
      setError("Impossibile segnare il reso come gestito");
    }
  }

  const formatDate = (value) => new Date(value).toLocaleString("it-IT");

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Resi</h1>
          <p>Riepilogo richieste reso da area privata clienti</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards inventory-cards">
        <div className="card">
          <div className="card-label">Totale richieste</div>
          <div className="card-value">{stats.total}</div>
        </div>
        <div className="card">
          <div className="card-label">Da gestire</div>
          <div className="card-value">{stats.pending}</div>
        </div>
        <div className="card">
          <div className="card-label">Gestiti</div>
          <div className="card-value">{stats.handled}</div>
        </div>
      </div>

      <div className="filters-row">
        <div className="filter-group">
          <label>Filtro</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Da gestire</option>
            <option value="HANDLED">Gestiti</option>
            <option value="ALL">Tutti</option>
          </select>
        </div>
      </div>

      <div className="orders-table returns-table">
        <div className="row header">
          <div>Data</div>
          <div>Ordine</div>
          <div>Cliente</div>
          <div>Prodotto</div>
          <div>Stato</div>
          <div></div>
        </div>
        {filteredItems.map((r) => (
          <div key={r.id} className="row">
            <div>{formatDate(r.createdAt)}</div>
            <div>{r.orderNumber}</div>
            <div>{r.customerName || "Cliente demo area privata"}</div>
            <div>{r.productName}</div>
            <div>
              <span className={`tag ${STATUS_META[r.status]?.cls || "info"}`}>
                {STATUS_META[r.status]?.label || r.status}
              </span>
            </div>
            <div>
              <button className="btn ghost small" onClick={() => openDetail(r.id)}>
                Dettagli
              </button>
            </div>
          </div>
        ))}
        {!filteredItems.length ? <div className="inventory-empty">Nessun reso</div> : null}
      </div>

      {detail ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal returns-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>Dettaglio reso</h3>
                </div>
                <button className="btn ghost" onClick={() => setDetail(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <div className="summary-grid returns-summary-grid">
                  <div><strong>Cliente</strong><div>{detail.customerName || "Cliente demo area privata"}</div></div>
                  <div><strong>Ordine</strong><div>{detail.orderNumber}</div></div>
                  <div><strong>Prodotto</strong><div>{detail.productName}</div></div>
                  <div><strong>Stato</strong><div>{STATUS_META[detail.status]?.label || detail.status}</div></div>
                  <div><strong>Data richiesta</strong><div>{formatDate(detail.createdAt)}</div></div>
                  <div><strong>Gestito il</strong><div>{detail.handledAt ? formatDate(detail.handledAt) : "-"}</div></div>
                </div>
                <div className="returns-problem-box">
                  <strong>Descrizione problema</strong>
                  <p>{detail.problemDescription}</p>
                </div>
                <div className="returns-images-wrap">
                  <strong>Immagini</strong>
                  <div className="returns-images-grid">
                    {detail.images?.length
                      ? detail.images.map((img) => (
                          <a
                            key={img.id}
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                            className="returns-image-card"
                          >
                            <img src={img.url} alt="Allegato reso" />
                            <span>{img.url.split("/").pop()}</span>
                          </a>
                        ))
                      : <div className="field-hint">Nessuna immagine allegata</div>}
                  </div>
                </div>
                {detail.status !== "HANDLED" ? (
                  <div className="actions">
                    <button className="btn primary" onClick={() => setConfirmHandle(detail)}>
                      Gestito
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {confirmHandle ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmHandle(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title"><h3>Conferma gestione</h3></div>
                <button className="btn ghost" onClick={() => setConfirmHandle(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <p>Sei sicuro di voler segnare questo reso come gestito?</p>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setConfirmHandle(null)}>Annulla</button>
                  <button className="btn primary" onClick={() => markHandled(confirmHandle.id)}>Conferma</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
