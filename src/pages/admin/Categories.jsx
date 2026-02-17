import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminCategories() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", description: "", parentId: "" });
  const [editing, setEditing] = useState(null);

  async function load() {
    try {
      const res = await api("/admin/categories");
      setItems(res || []);
    } catch {
      setError("Impossibile caricare categorie");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCategory(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/categories", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          parentId: form.parentId || undefined,
        }),
      });
      setForm({ name: "", description: "", parentId: "" });
      load();
    } catch {
      setError("Errore creazione categoria");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await api(`/admin/categories/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          description: editing.description || null,
          parentId: editing.parentId || null,
        }),
      });
      setEditing(null);
      load();
    } catch {
      setError("Errore modifica categoria");
    }
  }

  async function deleteCategory(id) {
    setError("");
    try {
      await api(`/admin/categories/${id}`, { method: "DELETE" });
      load();
    } catch {
      setError("Impossibile eliminare: rimuovi prima le sottocategorie.");
    }
  }

  async function moveCategory(id, direction) {
    const flatIds = visibleFlat.map((x) => x.id);
    const idx = flatIds.indexOf(id);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= flatIds.length) return;
    const next = [...flatIds];
    const [moved] = next.splice(idx, 1);
    next.splice(swap, 0, moved);
    try {
      await api("/admin/categories/reorder", {
        method: "PATCH",
        body: JSON.stringify({ ids: next }),
      });
      load();
    } catch {
      setError("Impossibile riordinare categorie");
    }
  }

  const byParent = new Map();
  for (const c of items) {
    const key = c.parentId || "root";
    const list = byParent.get(key) || [];
    list.push(c);
    byParent.set(key, list);
  }

  const flat = [];
  const walk = (parentId, prefix = "") => {
    const list = (byParent.get(parentId) || []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    for (const c of list) {
      flat.push({ ...c, label: `${prefix}${c.name}` });
      walk(c.id, `${prefix}— `);
    }
  };
  walk("root");

  const visibleFlat = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((c) => {
      const blob = `${c.name || ""} ${c.description || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [search, items]);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Categorie</h1>
          <p>Gestione categorie e sottocategorie</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel">
        <form className="form-grid" onSubmit={createCategory}>
          <label>
            Nome categoria
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Descrizione
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>
            Sottocategoria di
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="select">
              <option value="">Nessuna (categoria principale)</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Cerca
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome o descrizione" />
          </label>
          <div className="actions">
            <button className="btn primary" type="submit">Crea categoria</button>
          </div>
        </form>
      </div>

      <div className="table categories-rich-table">
        <div className="row header">
          <div>Categoria</div>
          <div>Tipo</div>
          <div>Descrizione</div>
          <div>Prodotti</div>
          <div>Azioni</div>
        </div>
        {visibleFlat.map((c) => (
          <div className="row" key={c.id}>
            <div>{c.label}</div>
            <div className="muted">{c.parentId ? "Sottocategoria" : "Principale"}</div>
            <div>{c.description || "—"}</div>
            <div>{c._count?.products || 0}</div>
            <div className="actions">
              <button className="btn ghost small" onClick={() => setEditing({ ...c })}>Modifica</button>
              <button className="btn ghost small" onClick={() => moveCategory(c.id, "up")}>↑</button>
              <button className="btn ghost small" onClick={() => moveCategory(c.id, "down")}>↓</button>
              <button className="btn danger small" onClick={() => deleteCategory(c.id)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <h3>Modifica categoria</h3>
          <div className="form-grid">
            <label>
              Nome
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              Descrizione
              <input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
            <label>
              Parent
              <select className="select" value={editing.parentId || ""} onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}>
                <option value="">Nessuno</option>
                {flat.filter((x) => x.id !== editing.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button className="btn ghost" onClick={() => setEditing(null)}>Annulla</button>
              <button className="btn primary" onClick={saveEdit}>Salva</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
