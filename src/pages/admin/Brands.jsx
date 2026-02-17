import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminBrands() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [error, setError] = useState("");

  async function loadBrands() {
    try {
      const res = await api("/admin/brands");
      setItems(res || []);
    } catch {
      setError("Impossibile caricare brand");
    }
  }

  useEffect(() => {
    loadBrands();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((b) => String(b.name || "").toLowerCase().includes(q));
  }, [items, search]);

  async function createBrand(e) {
    e.preventDefault();
    const next = name.trim();
    if (!next) return;
    try {
      await api("/admin/brands", { method: "POST", body: JSON.stringify({ name: next }) });
      setName("");
      await loadBrands();
    } catch {
      setError("Impossibile creare brand");
    }
  }

  async function saveRename(oldName) {
    const next = editingValue.trim();
    if (!next) return;
    try {
      await api(`/admin/brands/${encodeURIComponent(oldName)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      setEditing("");
      setEditingValue("");
      await loadBrands();
    } catch {
      setError("Impossibile rinominare brand");
    }
  }

  async function deleteBrand(brandName) {
    try {
      await api(`/admin/brands/${encodeURIComponent(brandName)}`, { method: "DELETE" });
      await loadBrands();
    } catch {
      setError("Impossibile eliminare brand");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Brand</h1>
          <p>Archivio brand centralizzato per prodotti e arrivo merci</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel brands-panel">
        <form className="brands-toolbar" onSubmit={createBrand}>
          <input
            placeholder="Nuovo brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary" type="submit">
            Aggiungi brand
          </button>
          <input
            placeholder="Cerca brand"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="table category-table">
          <div className="row header">
            <div>Nome</div>
            <div>Prodotti</div>
            <div>Azioni</div>
          </div>
          {filtered.map((b) => (
            <div className="row" key={b.name}>
              <div>
                {editing === b.name ? (
                  <input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                  />
                ) : (
                  <strong>{b.name}</strong>
                )}
              </div>
              <div>
                <strong>{b.productsCount || 0}</strong>
              </div>
              <div className="actions">
                {editing === b.name ? (
                  <>
                    <button className="btn ghost" onClick={() => saveRename(b.name)}>
                      Salva
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setEditing("");
                        setEditingValue("");
                      }}
                    >
                      Annulla
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setEditing(b.name);
                        setEditingValue(b.name);
                      }}
                    >
                      Modifica
                    </button>
                    <button className="btn danger" onClick={() => deleteBrand(b.name)}>
                      Elimina
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!filtered.length ? <div className="row"><div>Nessun brand</div><div>—</div><div>—</div></div> : null}
        </div>
      </div>
    </section>
  );
}
