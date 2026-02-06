import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import successAnim from "../../assets/Success.json";
import pulseAnim from "../../assets/Green Pulse Dot.json";
import { api } from "../../lib/api.js";
import Portal from "../../components/Portal.jsx";

export default function AdminSuppliers() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    csvFullUrl: "",
    csvStockUrl: "",
  });
  const [selected, setSelected] = useState(null);
  const [supplierProducts, setSupplierProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [priceOverride, setPriceOverride] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState(new Set());

  useEffect(() => {
    const open = Boolean(selectedProduct || showSuccess);
    document.body.classList.toggle("modal-open", open);
    return () => document.body.classList.remove("modal-open");
  }, [selectedProduct, showSuccess]);

  async function load() {
    try {
      const res = await api("/admin/suppliers");
      setItems(res);
    } catch (err) {
      setError("Impossibile caricare fornitori");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSupplier(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          csvFullUrl: form.csvFullUrl || undefined,
          csvStockUrl: form.csvStockUrl || undefined,
        }),
      });
      setForm({ name: "", code: "", csvFullUrl: "", csvStockUrl: "" });
      load();
    } catch (err) {
      setError("Errore creazione fornitore");
    }
  }

  async function updateStock(id) {
    try {
      await api(`/admin/suppliers/${id}/update-stock`, { method: "POST" });
      load();
    } catch (err) {
      setError("Errore aggiornamento giacenze");
    }
  }

  async function promoteToStore(product) {
    if (!selected) return;
    setActionMsg("");
    try {
      const payload = {
        supplierSku: product.supplierSku,
      };
      if (priceOverride) payload.price = Number(priceOverride);
      const res = await api(`/admin/suppliers/${selected.id}/promote`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActionMsg(`Importato in store: created ${res.created}, già presenti ${res.already}`);
      setSelectedProduct(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      viewProducts(selected);
    } catch (err) {
      setError("Errore import in store");
    }
  }

  async function promoteSelected() {
    if (!selected || selectedSkus.size === 0) return;
    setActionMsg("");
    try {
      const res = await api(`/admin/suppliers/${selected.id}/promote`, {
        method: "POST",
        body: JSON.stringify({ supplierSkus: Array.from(selectedSkus) }),
      });
      setActionMsg(`Prodotti importati con successo: created ${res.created}, già presenti ${res.already}`);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setSelectedSkus(new Set());
      viewProducts(selected);
    } catch (err) {
      setError("Errore import multiplo");
    }
  }

  async function viewProducts(supplier) {
    setSelected(supplier);
    try {
      const res = await api(`/admin/suppliers/${supplier.id}/products?limit=200&q=${encodeURIComponent(search)}`);
      setSupplierProducts(res);
      setSelectedSkus(new Set());
    } catch (err) {
      setError("Errore caricamento prodotti fornitore");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Fornitori</h1>
          <p>Configura e importa prodotti dal fornitore</p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {actionMsg ? <div className="panel">{actionMsg}</div> : null}
      {showSuccess ? (
        <Portal>
          <div className="success-center">
            <div className="success-card">
              <Lottie animationData={successAnim} loop={false} />
              <div>
                <strong>Importazione completata</strong>
                <div className="muted">Prodotto inserito nello store</div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      <div className="table">
        <div className="row header">
          <div>Nome</div>
          <div>Codice</div>
          <div>Azioni</div>
        </div>
        {items.map((s) => (
          <div className="row" key={s.id}>
            <div>{s.name}</div>
            <div className="mono">{s.code}</div>
            <div className="actions">
              <button className="btn ghost" onClick={() => updateStock(s.id)}>Aggiorna giacenze</button>
              <button className="btn ghost" onClick={() => viewProducts(s)}>Vedi prodotti</button>
            </div>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="panel" style={{ marginTop: "1.5rem" }}>
          <div className="page-header">
            <div>
              <h2>Prodotti fornitore</h2>
              <p>{selected.name} — ultimi {supplierProducts.length} risultati</p>
            </div>
            <div className="actions">
              <input
                placeholder="Cerca SKU o nome"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="btn" onClick={() => viewProducts(selected)}>Cerca</button>
              <button className={`btn ${bulkMode ? "primary" : "ghost"}`} onClick={() => setBulkMode(!bulkMode)}>
                {bulkMode ? "Selezione attiva" : "Import multiplo"}
              </button>
              <button className="btn primary" onClick={promoteSelected} disabled={!bulkMode || selectedSkus.size === 0}>
                Importa selezionati
              </button>
            </div>
          </div>
          <div className="table wide-6">
            <div className="row header">
              <div>Immagine</div>
              <div>SKU</div>
              <div>Nome</div>
              <div>Prezzo</div>
              <div>Giacenza</div>
              <div>Brand</div>
            </div>
            {supplierProducts.map((p) => (
              <div className="row clickable" key={p.id} onClick={() => setSelectedProduct(p)}>
                <div>
                  <div className="thumb-wrap">
                    {p.isImported ? (
                      <Lottie className="pulse-dot" animationData={pulseAnim} loop />
                    ) : null}
                    {p.imageUrl ? (
                      <img className="thumb" src={p.imageUrl} alt={p.name || p.supplierSku} />
                    ) : (
                      <div className="thumb placeholder" />
                    )}
                  </div>
                </div>
                <div className="mono">
                  {bulkMode ? (
                    <label className={`check ${p.isImported ? "disabled" : ""}`}>
                      <input
                        type="checkbox"
                        disabled={p.isImported}
                        checked={selectedSkus.has(p.supplierSku)}
                        onChange={(e) => {
                          const next = new Set(selectedSkus);
                          if (e.target.checked) next.add(p.supplierSku);
                          else next.delete(p.supplierSku);
                          setSelectedSkus(next);
                        }}
                      />
                      <span>{p.supplierSku}</span>
                    </label>
                  ) : (
                    p.supplierSku
                  )}
                </div>
                <div>{p.name || "-"}</div>
                <div>{p.price ? `€ ${Number(p.price).toFixed(2)}` : "-"}</div>
                <div>{p.stockQty ?? "-"}</div>
                <div>{p.brand || "-"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <h3>{selectedProduct.name || "Dettaglio prodotto"}</h3>
                {selectedProduct.isImported ? (
                  <span className="tag success">Già importato</span>
                ) : null}
              </div>
              <button className="btn ghost" onClick={() => setSelectedProduct(null)}>Chiudi</button>
            </div>
              <div className="modal-body">
                <div className="modal-media">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name || selectedProduct.supplierSku} />
                ) : (
                  <div className="thumb placeholder large" />
                )}
              </div>
              <div className="modal-info">
                {bulkMode ? (
                  <div className="tag success">Imposta i dettagli</div>
                ) : null}
                <div><strong>SKU:</strong> {selectedProduct.supplierSku}</div>
                <div><strong>Prezzo:</strong> {selectedProduct.price ? `€ ${Number(selectedProduct.price).toFixed(2)}` : "-"}</div>
                <div><strong>Giacenza:</strong> {selectedProduct.stockQty ?? "-"}</div>
                <div><strong>Disponibilità:</strong> {selectedProduct.stockQty && selectedProduct.stockQty > 0 ? "Disponibile" : "Out of stock"}</div>
                <div><strong>Brand:</strong> {selectedProduct.brand || "-"}</div>
                <div><strong>Categoria:</strong> {selectedProduct.category || "-"}</div>
                <div><strong>Descrizione:</strong></div>
                <div className="muted">{selectedProduct.description || "-"}</div>
                <div className="form-grid">
                  <label>
                    Prezzo vendita (€)
                    <input
                      type="number"
                      step="0.01"
                      placeholder={selectedProduct.price ? Number(selectedProduct.price).toFixed(2) : "0.00"}
                      value={priceOverride}
                      onChange={(e) => setPriceOverride(e.target.value)}
                    />
                  </label>
                  <div className="muted">
                    Giacenza sincronizzata dal fornitore
                  </div>
                </div>
                <div>
                  {bulkMode ? (
                    <button
                      className="btn primary"
                      onClick={() => {
                        const next = new Set(selectedSkus);
                        if (next.has(selectedProduct.supplierSku)) next.delete(selectedProduct.supplierSku);
                        else next.add(selectedProduct.supplierSku);
                        setSelectedSkus(next);
                      }}
                      disabled={selectedProduct.isImported}
                    >
                      {selectedProduct.isImported
                        ? "Già importato"
                        : selectedSkus.has(selectedProduct.supplierSku)
                        ? "Selezionato"
                        : "Seleziona"}
                    </button>
                  ) : (
                    <button
                      className="btn primary"
                      onClick={() => promoteToStore(selectedProduct)}
                      disabled={selectedProduct.isImported}
                    >
                      {selectedProduct.isImported ? "Già importato" : "Importa in store"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
