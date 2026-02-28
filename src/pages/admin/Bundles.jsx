import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

export default function AdminBundles() {
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", bundlePrice: "", active: true, items: [] });
  const [skuQuery, setSkuQuery] = useState("");
  const [bundleQuery, setBundleQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [viewMode, setViewMode] = useState("cards");

  async function load() {
    try {
      const [b, p] = await Promise.all([api("/admin/bundles"), api("/admin/products?limit=600")]);
      setBundles(b || []);
      setProducts(p || []);
      setError("");
    } catch {
      setError("Impossibile caricare bundle");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = skuQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products.filter((p) => [p.sku, p.name].join(" ").toLowerCase().includes(q)).slice(0, 60);
  }, [products, skuQuery]);

  const visibleBundles = useMemo(() => {
    const q = bundleQuery.trim().toLowerCase();
    if (!q) return bundles;
    return bundles.filter((b) =>
      `${b.name || ""} ${(b.items || []).map((i) => i.product?.sku || "").join(" ")}`.toLowerCase().includes(q)
    );
  }, [bundles, bundleQuery]);

  const stats = useMemo(
    () => ({
      total: bundles.length,
      active: bundles.filter((b) => b.active).length,
      products: bundles.reduce((acc, b) => acc + (b.items || []).length, 0),
    }),
    [bundles]
  );

  function addProduct(product) {
    setDraft((prev) => {
      const existing = prev.items.find((i) => i.productId === product.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.productId === product.id ? { ...i, qty: Number(i.qty || 1) + 1 } : i
          ),
        };
      }
      return {
        ...prev,
        items: [...prev.items, { productId: product.id, sku: product.sku, name: product.name, qty: 1 }],
      };
    });
  }

  async function saveBundle() {
    if (!draft.name.trim() || !draft.items.length) {
      setError("Nome e almeno un prodotto sono obbligatori");
      return;
    }
    try {
      const payload = {
        name: draft.name.trim(),
        bundlePrice: Number(draft.bundlePrice || 0),
        active: Boolean(draft.active),
        items: draft.items.map((i) => ({ productId: i.productId, qty: Number(i.qty || 1) })),
      };
      if (editingId) await api(`/admin/bundles/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/admin/bundles", { method: "POST", body: JSON.stringify(payload) });
      setDraft({ name: "", bundlePrice: "", active: true, items: [] });
      setEditingId("");
      await load();
    } catch {
      setError("Impossibile salvare bundle");
    }
  }

  async function removeBundle(id) {
    try {
      await api(`/admin/bundles/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Impossibile eliminare bundle");
    }
  }

  async function createProductFromBundle(b) {
    try {
      await api("/admin/bundles/create-product", {
        method: "POST",
        body: JSON.stringify({ bundleId: b.id }),
      });
      await load();
    } catch {
      setError("Impossibile creare prodotto da bundle");
    }
  }

  function editBundle(row) {
    setEditingId(row.id);
    setDraft({
      name: row.name || "",
      bundlePrice: row.bundlePrice != null ? String(row.bundlePrice) : "",
      active: Boolean(row.active),
      items: (row.items || []).map((i) => ({
        productId: i.productId,
        sku: i.product?.sku || "",
        name: i.product?.name || "",
        qty: Number(i.qty || 1),
      })),
    });
  }

  return (
    <section className="bundles-page">
      <div className="page-header">
        <div>
          <h1>Bundle prodotto</h1>
          <p>Accoppiamenti SKU con prezzo unico (in ordine restano righe SKU separate)</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards bundles-cards">
        <div className="card"><div className="card-label">Bundle</div><div className="card-value">{stats.total}</div></div>
        <div className="card"><div className="card-label">Attivi</div><div className="card-value">{stats.active}</div></div>
        <div className="card"><div className="card-label">SKU collegati</div><div className="card-value">{stats.products}</div></div>
      </div>

      <div className="bundles-layout">
        <div className="panel bundles-builder">
          <div className="bundles-builder-head">
            <h3>{editingId ? "Modifica bundle" : "Nuovo bundle"}</h3>
            <span className="tag">{draft.items.length} SKU</span>
          </div>
          <div className="bundles-builder-form">
            <label>Nome bundle<input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Prezzo bundle<input type="number" step="0.01" value={draft.bundlePrice} onChange={(e) => setDraft((p) => ({ ...p, bundlePrice: e.target.value }))} /></label>
            <label>Stato
              <select className="select" value={draft.active ? "1" : "0"} onChange={(e) => setDraft((p) => ({ ...p, active: e.target.value === "1" }))}>
                <option value="1">Attivo</option>
                <option value="0">Disattivo</option>
              </select>
            </label>
          </div>
          <label className="bundles-picker-search">Cerca prodotto<input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} placeholder="SKU o nome" /></label>
          <div className="bundles-picker-list">
            {filteredProducts.map((p) => (
              <button key={p.id} className="btn ghost small" onClick={() => addProduct(p)}>
                {p.sku} · {p.name}
              </button>
            ))}
          </div>
          <div className="table compact bundles-items-table">
            <div className="row header"><div>SKU</div><div>Prodotto</div><div>Q.tà</div><div></div></div>
            {draft.items.map((i) => (
              <div key={i.productId} className="row">
                <div className="mono">{i.sku}</div>
                <div>{i.name}</div>
                <div><input type="number" min="1" value={i.qty} onChange={(e) => setDraft((prev) => ({ ...prev, items: prev.items.map((x) => x.productId === i.productId ? { ...x, qty: Number(e.target.value || 1) } : x) }))} /></div>
                <div><button className="btn ghost small" onClick={() => setDraft((prev) => ({ ...prev, items: prev.items.filter((x) => x.productId !== i.productId) }))}>Rimuovi</button></div>
              </div>
            ))}
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={() => { setEditingId(""); setDraft({ name: "", bundlePrice: "", active: true, items: [] }); }}>Reset</button>
            <button className="btn primary" onClick={saveBundle}>{editingId ? "Salva bundle" : "Crea bundle"}</button>
          </div>
        </div>

        <div className="panel bundles-list-panel">
          <div className="bundles-list-head">
            <input value={bundleQuery} onChange={(e) => setBundleQuery(e.target.value)} placeholder="Cerca bundle o SKU..." />
            <div className="products-view-switch">
              <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
              <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
            </div>
          </div>

          {viewMode === "table" ? (
            <div className="table bundles-table-pro">
              <div className="row header"><div>Bundle</div><div>Prezzo</div><div>Stato</div><div>Composizione SKU</div><div>Azioni</div></div>
              {visibleBundles.map((b) => (
                <div className="row" key={b.id}>
                  <div>{b.name}</div>
                  <div>{money(b.bundlePrice)}</div>
                  <div><span className={`tag ${b.active ? "success" : "warn"}`}>{b.active ? "Attivo" : "Disattivo"}</span></div>
                  <div>{(b.items || []).map((i) => `${i.product?.sku || "?"} x${i.qty}`).join(" · ") || "-"}</div>
                  <div className="actions">
                    <button className="btn ghost small" onClick={() => editBundle(b)}>Modifica</button>
                    <button className="btn ghost small" onClick={() => createProductFromBundle(b)}>Crea prodotto</button>
                    <button className="btn danger small" onClick={() => removeBundle(b.id)}>Elimina</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bundles-cards-grid">
              {visibleBundles.map((b) => (
                <article key={b.id} className="bundle-card">
                  <div className="bundle-card-top">
                    <strong>{b.name}</strong>
                    <span className={`tag ${b.active ? "success" : "warn"}`}>{b.active ? "Attivo" : "Disattivo"}</span>
                  </div>
                  <div className="bundle-card-price">{money(b.bundlePrice)}</div>
                  <div className="bundle-card-items">{(b.items || []).map((i) => `${i.product?.sku || "?"} x${i.qty}`).join(" · ") || "-"}</div>
                  <div className="actions">
                    <button className="btn ghost small" onClick={() => editBundle(b)}>Modifica</button>
                    <button className="btn ghost small" onClick={() => createProductFromBundle(b)}>Crea prodotto</button>
                    <button className="btn danger small" onClick={() => removeBundle(b.id)}>Elimina</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
