import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    Number(v || 0)
  );

const initialForm = {
  id: "",
  sku: "",
  name: "",
  description: "",
  shortDescription: "",
  brand: "",
  category: "",
  subcategory: "",
  barcode: "",
  nicotine: "",
  mlProduct: "",
  stockQty: 0,
  purchasePrice: "",
  listPrice: "",
  price: "",
  taxRateId: "",
  exciseRateId: "",
};

export default function AdminInventory() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [qtyDraft, setQtyDraft] = useState({});

  async function loadInventory() {
    setLoading(true);
    try {
      const res = await api(`/admin/inventory/items?q=${encodeURIComponent(q.trim())}&limit=800`);
      setItems(res || []);
    } catch {
      setError("Impossibile caricare inventario");
    } finally {
      setLoading(false);
    }
  }

  async function loadMeta() {
    try {
      const [taxRes, exciseRes] = await Promise.all([api("/admin/taxes"), api("/admin/excises")]);
      setTaxes(taxRes || []);
      setExcises(exciseRes || []);
    } catch {
      setError("Impossibile caricare IVA/Accise");
    }
  }

  useEffect(() => {
    loadInventory();
    loadMeta();
  }, []);

  useEffect(() => {
    const t = setTimeout(loadInventory, 250);
    return () => clearTimeout(t);
  }, [q]);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalStock = items.reduce((sum, i) => sum + Number(i.stockQty || 0), 0);
    const totalValue = items.reduce(
      (sum, i) => sum + Number(i.purchasePrice || 0) * Number(i.stockQty || 0),
      0
    );
    const subtotal = items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.stockQty || 0), 0);
    const totalExcise = items.reduce((sum, i) => {
      const excise = i.exciseRateRef;
      if (!excise) return sum;
      const unit =
        excise.type === "ML"
          ? Number(excise.amount || 0) * Number(i.mlProduct || 0)
          : Number(excise.amount || 0);
      return sum + unit * Number(i.stockQty || 0);
    }, 0);
    const totalVat = items.reduce((sum, i) => {
      const rate = Number(i.taxRateRef?.rate || 0);
      if (!rate) return sum;
      const excise = i.exciseRateRef;
      const exciseUnit =
        excise?.type === "ML"
          ? Number(excise.amount || 0) * Number(i.mlProduct || 0)
          : Number(excise?.amount || 0);
      const taxable = Number(i.price || 0) + exciseUnit;
      return sum + taxable * Number(i.stockQty || 0) * (rate / 100);
    }, 0);
    return { totalItems, totalStock, totalValue, subtotal, totalExcise, totalVat };
  }, [items]);

  const subcategoryStats = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = (item.subcategory || "Senza sottocategoria").trim();
      const prev = map.get(key) || { name: key, qty: 0 };
      prev.qty += Number(item.stockQty || 0);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "it"));
  }, [items]);

  function openCreate() {
    setForm(initialForm);
    setShowEditModal(true);
  }

  function openEdit(item) {
    setForm({
      id: item.id,
      sku: item.sku || "",
      name: item.name || "",
      description: item.description || "",
      shortDescription: item.shortDescription || "",
      brand: item.brand || "",
      category: item.category || "",
      subcategory: item.subcategory || "",
      barcode: item.barcode || "",
      nicotine: item.nicotine ?? "",
      mlProduct: item.mlProduct ?? "",
      stockQty: Number(item.stockQty || 0),
      purchasePrice: item.purchasePrice ?? "",
      listPrice: item.listPrice ?? "",
      price: item.price ?? "",
      taxRateId: item.taxRateId || "",
      exciseRateId: item.exciseRateId || "",
    });
    setShowEditModal(true);
  }

  function openQuickQty() {
    const draft = {};
    for (const item of items) draft[item.id] = String(Number(item.stockQty || 0));
    setQtyDraft(draft);
    setShowQtyModal(true);
  }

  async function saveItem() {
    if (!form.sku.trim() || !form.name.trim()) {
      setError("SKU e nome sono obbligatori");
      return;
    }
    setSaving(true);
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description || null,
      shortDescription: form.shortDescription || null,
      brand: form.brand || null,
      category: form.category || null,
      subcategory: form.subcategory || null,
      barcode: form.barcode || null,
      nicotine: form.nicotine === "" ? null : Number(form.nicotine),
      mlProduct: form.mlProduct === "" ? null : Number(form.mlProduct),
      stockQty: Number(form.stockQty || 0),
      purchasePrice: form.purchasePrice === "" ? null : Number(form.purchasePrice),
      listPrice: form.listPrice === "" ? null : Number(form.listPrice),
      price: form.price === "" ? null : Number(form.price),
      taxRateId: form.taxRateId || null,
      exciseRateId: form.exciseRateId || null,
    };
    try {
      if (form.id) {
        await api(`/admin/inventory/items/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/admin/inventory/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowEditModal(false);
      await loadInventory();
    } catch {
      setError("Impossibile salvare articolo inventario");
    } finally {
      setSaving(false);
    }
  }

  async function saveQuickQty() {
    const changes = items
      .map((item) => ({ id: item.id, stockQty: Number(qtyDraft[item.id]) }))
      .filter((row) => Number.isFinite(row.stockQty) && row.stockQty >= 0);

    if (!changes.length) return;
    setSaving(true);
    try {
      await api("/admin/inventory/quick-qty", {
        method: "PATCH",
        body: JSON.stringify({ changes }),
      });
      setShowQtyModal(false);
      await loadInventory();
    } catch {
      setError("Impossibile salvare quantità rapide");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Inventario</h1>
          <p>Magazzino interno separato dall'ecommerce</p>
        </div>
        <div className="page-actions inventory-actions">
          <button className="btn ghost" onClick={() => navigate("/admin/goods-receipts")}>Arrivo merci</button>
          <button className="btn ghost" onClick={openQuickQty}>Modifica quantità rapida</button>
          <button className="btn primary" onClick={openCreate}>Nuovo articolo</button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards inventory-cards">
        <div className="card"><div className="card-label">Articoli</div><div className="card-value">{stats.totalItems}</div></div>
        <div className="card"><div className="card-label">Giacenza totale</div><div className="card-value">{stats.totalStock}</div></div>
        <div className="card"><div className="card-label">Valore a costo</div><div className="card-value">{money(stats.totalValue)}</div></div>
        <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(stats.subtotal)}</div></div>
        <div className="card"><div className="card-label">Accise stimate</div><div className="card-value">{money(stats.totalExcise)}</div></div>
        <div className="card"><div className="card-label">IVA stimata</div><div className="card-value">{money(stats.totalVat)}</div></div>
      </div>

      <div className="filters-row">
        <div className="filter-group" style={{ minWidth: 280 }}>
          <label>Cerca</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SKU, nome, brand, categoria"
          />
        </div>
      </div>

      <div className="table subcategory-stock-table">
        <div className="row header">
          <div>Sottocategoria</div>
          <div>Quantità totale</div>
        </div>
        {subcategoryStats.length ? (
          subcategoryStats.map((s) => (
            <div className="row" key={s.name}>
              <div>{s.name}</div>
              <div>{s.qty}</div>
            </div>
          ))
        ) : (
          <div className="row">
            <div className="muted">Nessuna sottocategoria</div>
            <div>0</div>
          </div>
        )}
      </div>

      <div className="inventory-table">
        <div className="inventory-row header">
          <div>SKU</div><div>Nome</div><div>Brand</div><div>Categoria</div><div>Sottocategoria</div><div>Giacenza</div><div>Costo</div><div>Prezzo</div><div>Accisa</div><div>IVA</div><div></div>
        </div>
        {loading ? <div className="inventory-empty">Caricamento...</div> : null}
        {!loading && !items.length ? <div className="inventory-empty">Nessun articolo</div> : null}
        {!loading
          ? items.map((item) => (
              <div key={item.id} className="inventory-row">
                <div className="mono">{item.sku}</div>
                <div>{item.name}</div>
                <div>{item.brand || "-"}</div>
                <div>{item.category || "-"}</div>
                <div>{item.subcategory || "-"}</div>
                <div>{item.stockQty}</div>
                <div>{item.purchasePrice != null ? money(item.purchasePrice) : "-"}</div>
                <div>{item.price != null ? money(item.price) : "-"}</div>
                <div>{item.exciseRateRef?.name || "-"}</div>
                <div>{item.taxRateRef?.name || "-"}</div>
                <div><button className="btn ghost small" onClick={() => openEdit(item)}>Modifica</button></div>
              </div>
            ))
          : null}
      </div>

      {showEditModal ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
            <div className="modal inventory-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>{form.id ? "Modifica articolo inventario" : "Nuovo articolo inventario"}</h3>
                </div>
                <button className="btn ghost" onClick={() => setShowEditModal(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single inventory-modal-body">
                <div className="inventory-edit-grid">
                  <div><label>SKU</label><input value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} /></div>
                  <div><label>Nome</label><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div><label>Brand</label><input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} /></div>
                  <div><label>Categoria</label><input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
                  <div><label>Sottocategoria</label><input value={form.subcategory} onChange={(e) => setForm((p) => ({ ...p, subcategory: e.target.value }))} /></div>
                  <div><label>Barcode</label><input value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} /></div>
                  <div><label>Nicotina</label><input type="number" step="0.01" value={form.nicotine} onChange={(e) => setForm((p) => ({ ...p, nicotine: e.target.value }))} /></div>
                  <div><label>ML</label><input type="number" step="0.01" value={form.mlProduct} onChange={(e) => setForm((p) => ({ ...p, mlProduct: e.target.value }))} /></div>
                  <div><label>Giacenza</label><input type="number" value={form.stockQty} onChange={(e) => setForm((p) => ({ ...p, stockQty: Number(e.target.value || 0) }))} /></div>
                  <div><label>Prezzo acquisto</label><input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm((p) => ({ ...p, purchasePrice: e.target.value }))} /></div>
                  <div><label>Prezzo listino</label><input type="number" step="0.01" value={form.listPrice} onChange={(e) => setForm((p) => ({ ...p, listPrice: e.target.value }))} /></div>
                  <div><label>Prezzo vendita</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} /></div>
                  <div><label>IVA</label><select value={form.taxRateId} onChange={(e) => setForm((p) => ({ ...p, taxRateId: e.target.value }))}><option value="">Nessuna</option>{taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                  <div><label>Accisa</label><select value={form.exciseRateId} onChange={(e) => setForm((p) => ({ ...p, exciseRateId: e.target.value }))}><option value="">Nessuna</option>{excises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                  <div className="full"><label>Descrizione breve</label><input value={form.shortDescription} onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))} /></div>
                  <div className="full"><label>Descrizione</label><textarea className="goods-paste" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowEditModal(false)}>Annulla</button>
                  <button className="btn primary" onClick={saveItem} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {showQtyModal ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowQtyModal(false)}>
            <div className="modal inventory-qty-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title"><h3>Modifica quantità rapida</h3></div>
                <button className="btn ghost" onClick={() => setShowQtyModal(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single inventory-modal-body">
                <div className="inventory-qty-list">
                  <div className="inventory-qty-row header"><div>SKU</div><div>Prodotto</div><div>Qta</div></div>
                  {items.map((item) => (
                    <div key={item.id} className="inventory-qty-row">
                      <div className="mono">{item.sku}</div>
                      <div>{item.name}</div>
                      <div>
                        <input
                          type="number"
                          min="0"
                          value={qtyDraft[item.id] ?? item.stockQty}
                          onChange={(e) =>
                            setQtyDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowQtyModal(false)}>Annulla</button>
                  <button className="btn primary" onClick={saveQuickQty} disabled={saving}>{saving ? "Salvataggio..." : "Salva quantità"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
