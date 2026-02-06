import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminCategories() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", parentId: "" });

  async function load() {
    try {
      const res = await api("/admin/categories");
      setItems(res);
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
          parentId: form.parentId || undefined,
        }),
      });
      setForm({ name: "", parentId: "" });
      load();
    } catch {
      setError("Errore creazione categoria");
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
    const list = (byParent.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of list) {
      flat.push({ ...c, label: `${prefix}${c.name}` });
      walk(c.id, `${prefix}— `);
    }
  };
  walk("root");

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
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Sottocategoria di
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="select"
            >
              <option value="">Nessuna (categoria principale)</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button className="btn primary" type="submit">Crea categoria</button>
          </div>
        </form>
      </div>

      <div className="table">
        <div className="row header">
          <div>Categoria</div>
          <div>Parent</div>
        </div>
        {flat.map((c) => (
          <div className="row" key={c.id}>
            <div>{c.label}</div>
            <div className="muted">{c.parentId ? "Sottocategoria" : "Principale"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
