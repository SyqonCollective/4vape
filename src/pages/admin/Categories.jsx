import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

// CHECKLIST (admin richieste):
// [x] Riordino categorie principali e sottocategorie coerente per parent
// [x] Descrizione categoria con editor ricco

function RichTextEditor({ value, onChange, placeholder = "Descrizione categoria..." }) {
  const editorRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if ((value || "") !== el.innerHTML) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function run(command, arg) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, arg);
    onChange(el.innerHTML);
  }

  function onInput() {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onClick={() => run("bold")}>B</button>
        <button type="button" className="rte-btn" onClick={() => run("italic")}>I</button>
        <button type="button" className="rte-btn" onClick={() => run("underline")}>U</button>
        <button type="button" className="rte-btn" onClick={() => run("insertUnorderedList")}>• List</button>
        <button type="button" className="rte-btn" onClick={() => run("insertOrderedList")}>1. List</button>
        <button type="button" className="rte-btn" onClick={() => run("removeFormat")}>Clear</button>
      </div>
      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={onInput}
      />
    </div>
  );
}

export default function AdminCategories() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("cards");
  const [sortBy, setSortBy] = useState("count-desc");
  const [showOnlyRoot, setShowOnlyRoot] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", parentId: "" });
  const [editing, setEditing] = useState(null);

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function splitTokens(raw) {
    return String(raw || "")
      .split(/[|;,]/g)
      .map((x) => normalizeToken(x))
      .filter(Boolean);
  }

  function applyComputedCounts(categories, products) {
    const idsByName = new Map();
    for (const c of categories) {
      const key = normalizeToken(c.name);
      if (!key) continue;
      const list = idsByName.get(key) || [];
      list.push(c.id);
      idsByName.set(key, list);
    }

    const countMap = new Map();
    const addByName = (ids, raw) => {
      for (const token of splitTokens(raw)) {
        const matches = idsByName.get(token) || [];
        for (const id of matches) ids.add(id);
      }
    };

    for (const p of products || []) {
      const ids = new Set();
      const categoryIds = Array.isArray(p.categoryIds)
        ? p.categoryIds
        : p.categoryId
          ? [p.categoryId]
          : [];
      for (const id of categoryIds) {
        if (id) ids.add(id);
      }
      addByName(ids, p.category);
      addByName(ids, p.subcategory);
      if (Array.isArray(p.subcategories)) {
        for (const sub of p.subcategories) addByName(ids, sub);
      }
      for (const id of ids) {
        countMap.set(id, (countMap.get(id) || 0) + 1);
      }
    }

    return categories.map((c) => {
      const count = countMap.get(c.id) || 0;
      return { ...c, productsCount: count, _count: { ...(c._count || {}), products: count } };
    });
  }

  async function load() {
    try {
      const [cats, products] = await Promise.all([
        api("/admin/categories"),
        api("/admin/products"),
      ]);
      setItems(applyComputedCounts(cats || [], products || []));
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
    const current = items.find((x) => x.id === id);
    if (!current) return;
    const flatIds = items
      .filter((x) => (x.parentId || "") === (current.parentId || ""))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((x) => x.id);
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
      const parentName = c.parentId ? (items.find((x) => x.id === c.parentId)?.name || "") : "";
      const blob = `${c.name || ""} ${c.description || ""} ${parentName}`.toLowerCase();
      return blob.includes(q);
    });
  }, [search, items]);
  const sortedVisible = useMemo(() => {
    const base = showOnlyRoot ? visibleFlat.filter((c) => !c.parentId) : visibleFlat;
    return [...base].sort((a, b) => {
      if (sortBy === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "count-asc") return Number(a._count?.products || 0) - Number(b._count?.products || 0);
      return Number(b._count?.products || 0) - Number(a._count?.products || 0);
    });
  }, [showOnlyRoot, sortBy, visibleFlat]);

  const stripHtml = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parentNameById = useMemo(() => {
    const map = new Map();
    for (const c of items) map.set(c.id, c.name || "");
    return map;
  }, [items]);
  const stats = useMemo(() => {
    const total = items.length;
    const root = items.filter((x) => !x.parentId).length;
    const sub = items.filter((x) => !!x.parentId).length;
    const assigned = items.reduce((sum, x) => sum + Number(x._count?.products || 0), 0);
    const top = [...items].sort((a, b) => Number(b._count?.products || 0) - Number(a._count?.products || 0))[0];
    return { total, root, sub, assigned, top };
  }, [items]);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Categorie</h1>
          <p>Gestione categorie e sottocategorie</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel categories-panel">
        <form className="categories-form" onSubmit={createCategory}>
          <label className="field-name">
            Nome categoria
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field-parent">
            Sottocategoria di
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="select">
              <option value="">Nessuna (categoria principale)</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="field-search">
            Cerca
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nome" />
          </label>
          <div className="actions form-actions">
            <button className="btn primary" type="submit">Crea categoria</button>
          </div>
        </form>
      </div>

      <div className="panel categories-panel categories-pro">
        <div className="brands-kpis">
          <div className="brands-kpi"><span>Categorie totali</span><strong>{stats.total}</strong></div>
          <div className="brands-kpi"><span>Principali</span><strong>{stats.root}</strong></div>
          <div className="brands-kpi"><span>Sottocategorie</span><strong>{stats.sub}</strong></div>
          <div className="brands-kpi"><span>Top categoria</span><strong>{stats.top?.name || "—"}</strong><small>{stats.top ? `${stats.top._count?.products || 0} prodotti` : ""}</small></div>
        </div>
        <div className="brands-toolbar brands-toolbar-pro">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nome" />
          <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="count-desc">Più prodotti</option>
            <option value="count-asc">Meno prodotti</option>
            <option value="name-asc">Nome A-Z</option>
            <option value="name-desc">Nome Z-A</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={showOnlyRoot} onChange={(e) => setShowOnlyRoot(e.target.checked)} />
            <span>Solo principali</span>
          </label>
          <div className="brands-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
            <button type="button" className={`btn ${viewMode === "ranking" ? "primary" : "ghost"}`} onClick={() => setViewMode("ranking")}>Ranking</button>
          </div>
        </div>

      {viewMode === "table" ? (
      <div className="table categories-rich-table categories-table-pro">
        <div className="row header">
          <div>Categoria</div>
          <div>Tipo</div>
          <div>Prodotti</div>
          <div>Azioni</div>
        </div>
        {sortedVisible.map((c) => (
          <div className="row" key={c.id}>
            <div>
              <div>{c.label}</div>
              {c.parentId ? <div className="muted">Parent: {parentNameById.get(c.parentId) || "-"}</div> : null}
            </div>
            <div className="muted">{c.parentId ? "Sottocategoria" : "Principale"}</div>
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
      ) : null}

      {viewMode === "cards" ? (
        <div className="brands-cards-grid">
          {sortedVisible.map((c) => (
            <div className="brand-card-pro" key={c.id}>
              <div className="brand-card-top">
                <strong>{c.label}</strong>
                <span>{c._count?.products || 0} prodotti</span>
              </div>
              <small>{c.parentId ? "Sottocategoria" : "Categoria principale"}</small>
              <div className="actions">
                <button className="btn ghost small" onClick={() => setEditing({ ...c })}>Modifica</button>
                <button className="btn ghost small" onClick={() => moveCategory(c.id, "up")}>↑</button>
                <button className="btn ghost small" onClick={() => moveCategory(c.id, "down")}>↓</button>
                <button className="btn danger small" onClick={() => deleteCategory(c.id)}>Elimina</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {viewMode === "ranking" ? (
        <div className="brands-ranking">
          {sortedVisible.map((c, idx) => (
            <div className="brands-ranking-row" key={c.id}>
              <div className="rank">{idx + 1}</div>
              <div className="name">
                <strong>{c.label}</strong>
                <div className="muted">{c.parentId ? "Sottocategoria" : "Principale"}</div>
              </div>
              <div className="count">{c._count?.products || 0} prodotti</div>
            </div>
          ))}
        </div>
      ) : null}
      </div>

      {!sortedVisible.length ? (
        <div className="panel">
          <div className="muted">Nessuna categoria trovata</div>
        </div>
      ) : null}

      {editing ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setEditing(null)}>
            <div className="modal category-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Modifica categoria</div>
                  <div className="modal-subtitle">
                    {editing.parentId
                      ? `Sottocategoria di: ${parentNameById.get(editing.parentId) || "-"}`
                      : "Categoria principale"}
                  </div>
                </div>
                <button className="btn ghost" onClick={() => setEditing(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </label>
                  <label>
                    Descrizione
                    <RichTextEditor
                      value={editing.description || ""}
                      onChange={(next) => setEditing({ ...editing, description: next })}
                      placeholder="Descrizione categoria"
                    />
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
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setEditing(null)}>Annulla</button>
                  <button className="btn primary" onClick={saveEdit}>Salva</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
