import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminBrands() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("cards");
  const [sortBy, setSortBy] = useState("count-desc");
  const [onlyActive, setOnlyActive] = useState(false);
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
    const base = q
      ? items.filter((b) => String(b.name || "").toLowerCase().includes(q))
      : items;
    const active = onlyActive ? base.filter((b) => Number(b.productsCount || 0) > 0) : base;
    const sorted = [...active].sort((a, b) => {
      if (sortBy === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "count-asc") return Number(a.productsCount || 0) - Number(b.productsCount || 0);
      return Number(b.productsCount || 0) - Number(a.productsCount || 0);
    });
    return sorted;
  }, [items, onlyActive, search, sortBy]);

  const stats = useMemo(() => {
    const totalBrands = items.length;
    const totalProducts = items.reduce((sum, b) => sum + Number(b.productsCount || 0), 0);
    const activeBrands = items.filter((b) => Number(b.productsCount || 0) > 0).length;
    const top = [...items].sort((a, b) => Number(b.productsCount || 0) - Number(a.productsCount || 0))[0];
    return { totalBrands, totalProducts, activeBrands, top };
  }, [items]);

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
        <div className="brands-kpis">
          <div className="brands-kpi">
            <span>Brand totali</span>
            <strong>{stats.totalBrands}</strong>
          </div>
          <div className="brands-kpi">
            <span>Brand attivi</span>
            <strong>{stats.activeBrands}</strong>
          </div>
          <div className="brands-kpi">
            <span>Prodotti assegnati</span>
            <strong>{stats.totalProducts}</strong>
          </div>
          <div className="brands-kpi">
            <span>Top brand</span>
            <strong>{stats.top?.name || "—"}</strong>
            <small>{stats.top ? `${stats.top.productsCount || 0} prodotti` : ""}</small>
          </div>
        </div>

        <form className="brands-toolbar brands-toolbar-pro" onSubmit={createBrand}>
          <input placeholder="Nuovo brand" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit">
            Aggiungi
          </button>
          <input placeholder="Cerca brand" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="count-desc">Più prodotti</option>
            <option value="count-asc">Meno prodotti</option>
            <option value="name-asc">Nome A-Z</option>
            <option value="name-desc">Nome Z-A</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            <span>Solo attivi</span>
          </label>
          <div className="brands-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
            <button type="button" className={`btn ${viewMode === "ranking" ? "primary" : "ghost"}`} onClick={() => setViewMode("ranking")}>Ranking</button>
          </div>
        </form>

        {viewMode === "table" ? (
          <div className="table category-table brands-table-pro">
            <div className="row header">
              <div>Brand</div>
              <div>Prodotti</div>
              <div>Quota</div>
              <div>Azioni</div>
            </div>
            {filtered.map((b) => {
              const ratio = stats.totalProducts > 0 ? (Number(b.productsCount || 0) / stats.totalProducts) * 100 : 0;
              return (
                <div className="row" key={b.name}>
                  <div>
                    {editing === b.name ? (
                      <input value={editingValue} onChange={(e) => setEditingValue(e.target.value)} />
                    ) : (
                      <strong>{b.name}</strong>
                    )}
                  </div>
                  <div><strong>{b.productsCount || 0}</strong></div>
                  <div>
                    <div className="brands-ratio-bar"><i style={{ width: `${Math.max(4, Math.min(100, ratio))}%` }} /></div>
                    <small>{ratio.toFixed(1)}%</small>
                  </div>
                  <div className="actions">
                    {editing === b.name ? (
                      <>
                        <button type="button" className="btn ghost" onClick={() => saveRename(b.name)}>Salva</button>
                        <button
                          type="button"
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
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setEditing(b.name);
                            setEditingValue(b.name);
                          }}
                        >
                          Modifica
                        </button>
                        <button type="button" className="btn danger" onClick={() => deleteBrand(b.name)}>
                          Elimina
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!filtered.length ? <div className="row"><div>Nessun brand</div><div>—</div><div>—</div><div>—</div></div> : null}
          </div>
        ) : null}

        {viewMode === "cards" ? (
          <div className="brands-cards-grid">
            {filtered.map((b) => {
              const ratio = stats.totalProducts > 0 ? (Number(b.productsCount || 0) / stats.totalProducts) * 100 : 0;
              return (
                <div className="brand-card-pro" key={b.name}>
                  <div className="brand-card-top">
                    <strong>{b.name}</strong>
                    <span>{b.productsCount || 0} prodotti</span>
                  </div>
                  <div className="brands-ratio-bar"><i style={{ width: `${Math.max(4, Math.min(100, ratio))}%` }} /></div>
                  <small>Incidenza catalogo: {ratio.toFixed(1)}%</small>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setEditing(b.name);
                        setEditingValue(b.name);
                        setViewMode("table");
                      }}
                    >
                      Modifica
                    </button>
                    <button type="button" className="btn danger" onClick={() => deleteBrand(b.name)}>
                      Elimina
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {viewMode === "ranking" ? (
          <div className="brands-ranking">
            {filtered.map((b, idx) => (
              <div className="brands-ranking-row" key={b.name}>
                <div className="rank">{idx + 1}</div>
                <div className="name"><strong>{b.name}</strong></div>
                <div className="count">{b.productsCount || 0} prodotti</div>
              </div>
            ))}
            {!filtered.length ? <div className="muted">Nessun brand</div> : null}
          </div>
        ) : null}
        
      </div>
    </section>
  );
}
