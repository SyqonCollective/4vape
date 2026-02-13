import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

export default function AdminReturns() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [confirmHandle, setConfirmHandle] = useState(null);

  async function loadReturns() {
    try {
      const res = await api(`/admin/returns?status=${status}`);
      setItems(res || []);
    } catch {
      setError("Impossibile caricare resi");
    }
  }

  useEffect(() => {
    loadReturns();
  }, [status]);

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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Resi</h1>
          <p>Riepilogo richieste reso da area privata clienti</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

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

      <div className="orders-table">
        <div className="row header" style={{ gridTemplateColumns: "170px 150px 1.2fr 1.1fr 120px 100px" }}>
          <div>Data</div>
          <div>Ordine</div>
          <div>Cliente</div>
          <div>Prodotto</div>
          <div>Stato</div>
          <div></div>
        </div>
        {items.map((r) => (
          <div key={r.id} className="row" style={{ gridTemplateColumns: "170px 150px 1.2fr 1.1fr 120px 100px" }}>
            <div>{new Date(r.createdAt).toLocaleString("it-IT")}</div>
            <div>{r.orderNumber}</div>
            <div>{r.customerName || "Cliente demo area privata"}</div>
            <div>{r.productName}</div>
            <div>{r.status === "HANDLED" ? "Gestito" : "Da gestire"}</div>
            <div>
              <button className="btn ghost small" onClick={() => openDetail(r.id)}>Dettagli</button>
            </div>
          </div>
        ))}
        {!items.length ? <div className="inventory-empty">Nessun reso</div> : null}
      </div>

      {detail ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal inventory-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>Dettaglio reso</h3>
                </div>
                <button className="btn ghost" onClick={() => setDetail(null)}>Chiudi</button>
              </div>
              <div className="modal-body">
                <div className="summary-grid">
                  <div><strong>Cliente</strong><div>{detail.customerName || "Cliente demo area privata"}</div></div>
                  <div><strong>Ordine</strong><div>{detail.orderNumber}</div></div>
                  <div><strong>Prodotto</strong><div>{detail.productName}</div></div>
                  <div><strong>Stato</strong><div>{detail.status === "HANDLED" ? "Gestito" : "Da gestire"}</div></div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <strong>Descrizione problema</strong>
                  <p>{detail.problemDescription}</p>
                </div>
                <div style={{ marginTop: 14 }}>
                  <strong>Immagini</strong>
                  <div className="goods-receipts-list" style={{ marginTop: 8 }}>
                    {detail.images?.length
                      ? detail.images.map((img) => (
                          <a
                            key={img.id}
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                            className="result-item"
                          >
                            {img.url}
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
              <div className="modal-body">
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
