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
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [confirmHandle, setConfirmHandle] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((x) => {
      if (status !== "ALL" && x.status !== status) return false;
      if (!query) return true;
      return [
        x.orderNumber,
        x.customerName,
        x.productName,
        x.problemDescription,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [items, q, status]);

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

  async function deleteReturn(id) {
    try {
      await api(`/admin/returns/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setDetail(null);
      await loadReturns();
    } catch {
      setError("Impossibile eliminare reso");
    }
  }

  const formatDate = (value) => new Date(value).toLocaleString("it-IT");

  return (
    <section className="returns-page">
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

      <div className="returns-filters-shell">
        <div className="returns-filters-top">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per ordine, cliente, prodotto, descrizione..."
          />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              setStatus("PENDING");
              setQ("");
            }}
          >
            Reset filtri
          </button>
        </div>
        <div className="filters-row returns-filters-grid">
          <div className="filter-group">
            <label>Stato</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Da gestire</option>
              <option value="HANDLED">Gestiti</option>
              <option value="ALL">Tutti</option>
            </select>
          </div>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="orders-table returns-table returns-table-pro">
          <div className="row header">
            <div>Data</div>
            <div>Ordine</div>
            <div>Cliente</div>
            <div>Prodotto</div>
            <div>Stato</div>
            <div>Azioni</div>
          </div>
          {filteredItems.map((r) => (
            <div key={r.id} className="row">
              <div>{formatDate(r.createdAt)}</div>
              <div className="mono">{r.orderNumber}</div>
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
      ) : (
        <div className="returns-cards-grid">
          {filteredItems.map((r) => (
            <article className="returns-card" key={r.id}>
              <div className="returns-card-top">
                <strong className="mono">{r.orderNumber}</strong>
                <span className={`tag ${STATUS_META[r.status]?.cls || "info"}`}>
                  {STATUS_META[r.status]?.label || r.status}
                </span>
              </div>
              <strong>{r.customerName || "Cliente demo area privata"}</strong>
              <div className="muted">{r.productName}</div>
              <div className="muted">{formatDate(r.createdAt)}</div>
              <button className="btn ghost" onClick={() => openDetail(r.id)}>
                Apri dettaglio
              </button>
            </article>
          ))}
          {!filteredItems.length ? <div className="inventory-empty">Nessun reso</div> : null}
        </div>
      )}

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
                    <button className="btn danger" onClick={() => setConfirmDelete(detail)}>
                      Elimina reso
                    </button>
                    <button className="btn primary" onClick={() => setConfirmHandle(detail)}>
                      Gestito
                    </button>
                  </div>
                ) : (
                  <div className="actions">
                    <button className="btn danger" onClick={() => setConfirmDelete(detail)}>
                      Elimina reso
                    </button>
                  </div>
                )}
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

      {confirmDelete ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title"><h3>Conferma eliminazione</h3></div>
                <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single returns-modal-body">
                <p>Sei sicuro di voler eliminare questo reso?</p>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Annulla</button>
                  <button className="btn danger" onClick={() => deleteReturn(confirmDelete.id)}>Elimina</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
