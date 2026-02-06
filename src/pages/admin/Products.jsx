import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import trashAnim from "../../assets/Trash clean.json";
import { api } from "../../lib/api.js";
import Portal from "../../components/Portal.jsx";

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [edit, setEdit] = useState({ name: "", description: "", price: "", stockQty: "", imageUrl: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const open = Boolean(selectedProduct || confirmDelete || showDeleteSuccess);
    document.body.classList.toggle("modal-open", open);
    return () => document.body.classList.remove("modal-open");
  }, [selectedProduct, confirmDelete, showDeleteSuccess]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/admin/products");
        if (!active) return;
        setItems(res);
      } catch (err) {
        setError("Impossibile caricare i prodotti");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  function openEdit(p) {
    setSelectedProduct(p);
    setEdit({
      name: p.name || "",
      description: p.description || "",
      price: p.price ? Number(p.price).toFixed(2) : "",
      stockQty: p.stockQty ?? "",
      imageUrl: p.imageUrl || "",
    });
  }

  async function saveEdit() {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name || undefined,
          description: edit.description || undefined,
          price: edit.price ? Number(edit.price) : undefined,
          stockQty: edit.stockQty !== "" ? Number(edit.stockQty) : undefined,
          imageUrl: edit.imageUrl || undefined,
        }),
      });
      setSelectedProduct(null);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore salvataggio prodotto");
    }
  }

  async function deleteProduct() {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}`, { method: "DELETE" });
      setSelectedProduct(null);
      setConfirmDelete(false);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2000);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore eliminazione prodotto");
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api(`/admin/products/${id}`, { method: "DELETE" })));
      setSelectedIds(new Set());
      setConfirmDelete(false);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2000);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore eliminazione prodotti");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Prodotti</h1>
          <p>Catalogo principale con giacenze</p>
        </div>
        <div className="actions">
          <button className={`btn ${bulkMode ? "primary" : "ghost"}`} onClick={() => setBulkMode(!bulkMode)}>
            {bulkMode ? "Selezione attiva" : "Multi selection"}
          </button>
          {bulkMode ? (
            <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={selectedIds.size === 0}>
              Elimina selezionati
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="table wide-6">
        <div className="row header">
          <div>Immagine</div>
          <div>SKU</div>
          <div>Nome</div>
          <div>Prezzo</div>
          <div>Giacenza</div>
          <div>Fornitore</div>
        </div>
        {items.map((p) => (
          <div
            className="row clickable"
            key={p.id}
            onClick={() => {
              if (!bulkMode) openEdit(p);
            }}
          >
            <div>
              {p.imageUrl ? <img className="thumb" src={p.imageUrl} alt={p.name} /> : <div className="thumb placeholder" />}
            </div>
            <div className="mono">
              {bulkMode ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelectedIds(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{p.sku}</span>
                </label>
              ) : (
                p.sku
              )}
            </div>
            <div>{p.name}</div>
            <div>€ {Number(p.price).toFixed(2)}</div>
            <div>{p.stockQty}</div>
            <div>{p.sourceSupplier?.name || (p.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</div>
          </div>
        ))}
      </div>

      {showDeleteSuccess ? (
        <Portal>
          <div className="success-center">
            <div className="success-card">
              <Lottie animationData={trashAnim} loop={false} />
              <div>
                <strong>Eliminazione completata</strong>
                <div className="muted">Prodotto rimosso dallo store</div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {selectedProduct ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifica prodotto</h3>
              <button className="btn ghost" onClick={() => setSelectedProduct(null)}>Chiudi</button>
            </div>
            <div className="modal-body">
              <div className="modal-media">
                {edit.imageUrl ? (
                  <img src={edit.imageUrl} alt={edit.name} />
                ) : (
                  <div className="thumb placeholder large" />
                )}
                <button className="delete-chip" onClick={() => setConfirmDelete(true)}>
                  Elimina
                </button>
              </div>
              <div className="modal-info">
                {bulkMode ? (
                  <div className="flag hero">
                    <span className="flag-dot" />
                    Imposta i dettagli
                  </div>
                ) : null}
                <div><strong>SKU:</strong> {selectedProduct.sku}</div>
                <div><strong>Fornitore:</strong> {selectedProduct.sourceSupplier?.name || (selectedProduct.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</div>
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  </label>
                  <label>
                    Prezzo
                    <input type="number" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  </label>
                  <label>
                    Giacenza
                    <input
                      type="number"
                      step="1"
                      value={edit.stockQty}
                      onChange={(e) => setEdit({ ...edit, stockQty: e.target.value })}
                      disabled={selectedProduct.source === "SUPPLIER"}
                    />
                    {selectedProduct.source === "SUPPLIER" ? (
                      <div className="muted">La giacenza è sincronizzata dal fornitore</div>
                    ) : null}
                  </label>
                  <label>
                    Immagine URL
                    <input value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} />
                  </label>
                </div>
                <label>
                  Descrizione
                  <textarea
                    value={edit.description}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                    rows={5}
                  />
                </label>
                <div className="actions">
                  <button className="btn primary" onClick={saveEdit}>Salva</button>
                  <button className="btn danger" onClick={() => setConfirmDelete(true)}>Elimina</button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {confirmDelete ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Sei sicuro di voler eliminare {bulkMode ? selectedIds.size : 1} prodotti?</h3>
            <p className="muted">L’azione è irreversibile.</p>
            <div className="actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Annulla</button>
              <button className="btn danger" onClick={bulkMode ? deleteSelected : deleteProduct}>Conferma</button>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
