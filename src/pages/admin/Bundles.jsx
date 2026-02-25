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
  const [editingId, setEditingId] = useState("");

  async function load() {
    try {
      const [b, p] = await Promise.all([api("/admin/bundles"), api("/admin/products?limit=400")]);
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
    if (!q) return products.slice(0, 50);
    return products
      .filter((p) => [p.sku, p.name].join(" ").toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, skuQuery]);

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
      if (editingId) {
        await api(`/admin/bundles/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/admin/bundles", { method: "POST", body: JSON.stringify(payload) });
      }
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
    <section>
      <div className="page-header">
        <div>
          <h1>Bundle prodotto</h1>
          <p>Accoppiamenti SKU con prezzo unico (in ordine restano righe SKU separate)</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel form-grid">
        <label>Nome bundle<input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} /></label>
        <label>Prezzo bundle<input type="number" step="0.01" value={draft.bundlePrice} onChange={(e) => setDraft((p) => ({ ...p, bundlePrice: e.target.value }))} /></label>
        <label>
          Attivo
          <select className="select" value={draft.active ? "1" : "0"} onChange={(e) => setDraft((p) => ({ ...p, active: e.target.value === "1" }))}>
            <option value="1">Sì</option>
            <option value="0">No</option>
          </select>
        </label>
        <label className="full">Cerca SKU<input value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} placeholder="SKU o nome" /></label>
        <div className="full" style={{ maxHeight: 180, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, padding: 8 }}>
          {filteredProducts.map((p) => (
            <button key={p.id} className="btn ghost small" style={{ margin: 4 }} onClick={() => addProduct(p)}>
              {p.sku} · {p.name}
            </button>
          ))}
        </div>
        <div className="full table compact">
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

      <div className="table wide-report" style={{ marginTop: 12 }}>
        <div className="row header"><div>Bundle</div><div>Prezzo</div><div>Attivo</div><div>Composizione SKU</div><div>Azioni</div></div>
        {bundles.map((b) => (
          <div className="row" key={b.id}>
            <div>{b.name}</div>
            <div>{money(b.bundlePrice)}</div>
            <div>{b.active ? "Sì" : "No"}</div>
            <div>{(b.items || []).map((i) => `${i.product?.sku || "?"} x${i.qty}`).join(" · ") || "-"}</div>
            <div className="actions">
              <button className="btn ghost small" onClick={() => editBundle(b)}>Modifica</button>
              <button className="btn danger small" onClick={() => removeBundle(b.id)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
