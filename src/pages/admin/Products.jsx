import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [edit, setEdit] = useState({ name: "", description: "", price: "", stockQty: "", imageUrl: "" });

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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Prodotti</h1>
          <p>Catalogo principale con giacenze</p>
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
          <div className="row clickable" key={p.id} onClick={() => openEdit(p)}>
            <div>
              {p.imageUrl ? <img className="thumb" src={p.imageUrl} alt={p.name} /> : <div className="thumb placeholder" />}
            </div>
            <div className="mono">{p.sku}</div>
            <div>{p.name}</div>
            <div>€ {Number(p.price).toFixed(2)}</div>
            <div>{p.stockQty}</div>
            <div>{p.sourceSupplier?.name || (p.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</div>
          </div>
        ))}
      </div>

      {selectedProduct ? (
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
              </div>
              <div className="modal-info">
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
                <div>
                  <button className="btn primary" onClick={saveEdit}>Salva</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
