import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import trashAnim from "../../assets/Trash clean.json";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [edit, setEdit] = useState({
    name: "",
    description: "",
    price: "",
    stockQty: "",
    imageUrl: "",
    categoryId: "",
    parentId: "",
    isParent: false,
  });
  const [categories, setCategories] = useState([]);
  const [parents, setParents] = useState([]);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showCreateParent, setShowCreateParent] = useState(false);
  const [parentDraft, setParentDraft] = useState({ name: "", sku: "", categoryId: "" });
  const [parentChildren, setParentChildren] = useState(new Set());
  const [childSearch, setChildSearch] = useState("");
  const [childCategory, setChildCategory] = useState("");
  const [childOnlyFree, setChildOnlyFree] = useState(true);
  const [parentImageFile, setParentImageFile] = useState(null);
  const [parentImagePreview, setParentImagePreview] = useState("");
  const token = getToken();
  const fileInputRef = useRef(null);
  const parentFileInputRef = useRef(null);
  const categoryOptions = (() => {
    const byParent = new Map();
    for (const c of categories) {
      const key = c.parentId || "root";
      const list = byParent.get(key) || [];
      list.push(c);
      byParent.set(key, list);
    }
    const result = [];
    const walk = (parentId, prefix = "") => {
      const list = (byParent.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
      for (const c of list) {
        result.push({ ...c, label: `${prefix}${c.name}` });
        walk(c.id, `${prefix}— `);
      }
    };
    walk("root");
    return result;
  })();
  const parentOptions = parents.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  const withToken = (url) => {
    if (!url) return url;
    let fixed = url;
    if (fixed.startsWith("/uploads/")) {
      fixed = `/api${fixed}`;
    }
    if (fixed.startsWith("/api/suppliers/")) {
      fixed = fixed.replace("/api/suppliers/", "/api/admin/suppliers/");
    }
    if (fixed.startsWith("/api/") && token) {
      const joiner = fixed.includes("?") ? "&" : "?";
      return `${fixed}${joiner}token=${token}`;
    }
    return fixed;
  };

  useEffect(() => {
    const open = Boolean(selectedProduct || confirmDelete || showDeleteSuccess || showCreateParent);
    document.body.classList.toggle("modal-open", open);
    return () => document.body.classList.remove("modal-open");
  }, [selectedProduct, confirmDelete, showDeleteSuccess, showCreateParent]);

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

  useEffect(() => {
    let active = true;
    async function loadCategories() {
      try {
        const res = await api("/admin/categories");
        if (!active) return;
        setCategories(res);
      } catch {
        // ignore
      }
    }
    loadCategories();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadParents() {
      try {
        const res = await api("/admin/products?parents=true");
        if (!active) return;
        setParents(res);
      } catch {
        // ignore
      }
    }
    loadParents();
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
      categoryId: p.categoryId || "",
      parentId: p.parentId || "",
      isParent: Boolean(p.isParent),
    });
    setImages(p.images || []);
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
          categoryId: edit.categoryId || undefined,
          parentId: edit.parentId || undefined,
          isParent: edit.isParent,
        }),
      });
      setSelectedProduct(null);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore salvataggio prodotto");
    }
  }

  async function refreshImages(id) {
    try {
      const res = await api(`/admin/products/${id}/images`);
      setImages(res);
    } catch {
      // ignore
    }
  }

  async function uploadFiles(files) {
    if (!selectedProduct || !files || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch(`/api/admin/products/${selectedProduct.id}/images`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      await refreshImages(selectedProduct.id);
    } catch (err) {
      setError("Errore upload immagini");
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(imageId) {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}/images/${imageId}`, { method: "DELETE" });
      await refreshImages(selectedProduct.id);
    } catch {
      setError("Errore eliminazione immagine");
    }
  }

  function setAsMain(imageUrl) {
    setEdit((prev) => ({ ...prev, imageUrl }));
  }

  async function deleteProduct() {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}`, { method: "DELETE" });
      setSelectedProduct(null);
      setConfirmDelete(false);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2000);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore eliminazione prodotto");
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api(`/admin/products/${id}`, { method: "DELETE" })));
      setSelectedIds(new Set());
      setConfirmDelete(false);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2000);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore eliminazione prodotti");
    }
  }

  async function createParentProduct() {
    if (!parentDraft.name.trim() || !parentDraft.sku.trim()) {
      setError("Nome e SKU sono obbligatori");
      return;
    }
    try {
      const parent = await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name: parentDraft.name.trim(),
          sku: parentDraft.sku.trim(),
          categoryId: parentDraft.categoryId || undefined,
          isParent: true,
          price: 0,
          stockQty: 0,
        }),
      });
      if (parentImageFile) {
        const form = new FormData();
        form.append("files", parentImageFile);
        const res = await fetch(`/api/admin/products/${parent.id}/images`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          const uploaded = data?.items?.[0];
          if (uploaded?.url) {
            await api(`/admin/products/${parent.id}`, {
              method: "PATCH",
              body: JSON.stringify({ imageUrl: uploaded.url }),
            });
          }
        }
      }
      if (parentChildren.size > 0) {
        await Promise.all(
          Array.from(parentChildren).map((id) =>
            api(`/admin/products/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ parentId: parent.id }),
            })
          )
        );
      }
      setShowCreateParent(false);
      setParentDraft({ name: "", sku: "", categoryId: "" });
      setParentChildren(new Set());
      setParentImageFile(null);
      setParentImagePreview("");
      const res = await api("/admin/products");
      setItems(res);
      const p = await api("/admin/products?parents=true");
      setParents(p);
    } catch (err) {
      setError("Errore creazione prodotto genitore");
    }
  }

  const filteredChildren = items.filter((p) => {
    if (p.isParent) return false;
    if (childOnlyFree && p.parentId) return false;
    if (childCategory && p.categoryId !== childCategory) return false;
    if (childSearch.trim()) {
      const q = childSearch.trim().toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Prodotti</h1>
          <p>Catalogo principale con giacenze</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setShowCreateParent(true)}>
            Crea prodotto genitore
          </button>
          <button className={`btn ${bulkMode ? "primary" : "ghost"}`} onClick={() => setBulkMode(!bulkMode)}>
            {bulkMode ? "Selezione attiva" : "Multi selection"}
          </button>
          {bulkMode ? (
            <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={selectedIds.size === 0}>
              Elimina selezionati
            </button>
          ) : null}
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

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
          <div
            className="row clickable"
            key={p.id}
            onClick={() => {
              if (bulkMode) {
                const next = new Set(selectedIds);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                setSelectedIds(next);
                return;
              }
              openEdit(p);
            }}
          >
            <div>
              {p.imageUrl ? (
                <img
                  className="thumb"
                  src={withToken(p.imageUrl)}
                  alt={p.name}
                  onClick={(e) => {
                    if (!bulkMode) return;
                    e.stopPropagation();
                    const next = new Set(selectedIds);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    setSelectedIds(next);
                  }}
                />
              ) : (
                <div className="thumb placeholder" />
              )}
            </div>
            <div className="mono">
              {bulkMode ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelectedIds(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{p.sku}</span>
                </label>
              ) : (
                p.sku
              )}
            </div>
            <div>
              {p.name}
              {p.isParent ? <span className="tag">Padre</span> : null}
            </div>
            <div>€ {Number(p.price).toFixed(2)}</div>
            <div>{p.stockQty}</div>
            <div>{p.sourceSupplier?.name || (p.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</div>
          </div>
        ))}
      </div>

      {showDeleteSuccess ? (
        <Portal>
          <div className="success-center">
            <div className="success-card">
              <Lottie animationData={trashAnim} loop={false} />
              <div>
                <strong>Eliminazione completata</strong>
                <div className="muted">Prodotto rimosso dallo store</div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {selectedProduct ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifica prodotto</h3>
              <button className="btn ghost" onClick={() => setSelectedProduct(null)}>Chiudi</button>
            </div>
            <div className="modal-body">
              <div className="modal-media">
                {edit.imageUrl ? (
                  <img src={withToken(edit.imageUrl)} alt={edit.name} />
                ) : (
                  <div className="thumb placeholder large" />
                )}
                <div
                  className={`upload-drop ${uploading ? "loading" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="muted">
                    Trascina immagini qui o clicca per caricare
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => uploadFiles(e.target.files)}
                    style={{ display: "none" }}
                  />
                </div>
                {images.length > 0 ? (
                  <div className="image-grid">
                    {images.map((img) => (
                      <div className="image-item" key={img.id}>
                        <img src={withToken(img.url)} alt="" />
                        <div className="image-actions">
                          <button className="btn ghost" onClick={() => setAsMain(img.url)}>
                            Copertina
                          </button>
                          <button className="btn danger" onClick={() => deleteImage(img.id)}>
                            Elimina
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button className="delete-chip" onClick={() => setConfirmDelete(true)}>
                  Elimina
                </button>
              </div>
              <div className="modal-info">
                {bulkMode ? (
                  <div className="flag hero">
                    <span className="flag-dot" />
                    Imposta i dettagli
                  </div>
                ) : null}
                <div><strong>SKU:</strong> {selectedProduct.sku}</div>
                <div><strong>Fornitore:</strong> {selectedProduct.sourceSupplier?.name || (selectedProduct.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</div>
                {selectedProduct.isParent ? (
                  <div><strong>Figli:</strong> {selectedProduct.children?.length || 0}</div>
                ) : null}
                <div className="form-grid">
                  <label>
                    Nome
                    <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  </label>
                  <label>
                    Prezzo
                    <input
                      type="number"
                      step="0.01"
                      value={edit.price}
                      onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                      disabled={edit.isParent}
                    />
                  </label>
                  <label>
                    Categoria
                    <select
                      className="select"
                      value={edit.categoryId || ""}
                      onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}
                    >
                      <option value="">Seleziona categoria</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prodotto padre
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.isParent}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            isParent: e.target.checked,
                            parentId: e.target.checked ? "" : edit.parentId,
                          })
                        }
                      />
                      <span>Non vendibile</span>
                    </div>
                    <div className="muted">Per creare un nuovo genitore usa “Crea prodotto genitore”.</div>
                  </label>
                  <label>
                    Assegna a padre
                    <select
                      className="select"
                      value={edit.parentId || ""}
                      onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}
                      disabled={edit.isParent}
                    >
                      <option value="">Nessuno</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Giacenza
                    <input
                      type="number"
                      step="1"
                      value={edit.stockQty}
                      onChange={(e) => setEdit({ ...edit, stockQty: e.target.value })}
                      disabled={selectedProduct.source === "SUPPLIER" || edit.isParent}
                    />
                    {selectedProduct.source === "SUPPLIER" ? (
                      <div className="muted">La giacenza è sincronizzata dal fornitore</div>
                    ) : null}
                    {edit.isParent ? <div className="muted">Prodotto padre non vendibile</div> : null}
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
                <div className="actions">
                  <button className="btn primary" onClick={saveEdit}>Salva</button>
                  <button className="btn danger" onClick={() => setConfirmDelete(true)}>Elimina</button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {confirmDelete ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Sei sicuro di voler eliminare {bulkMode ? selectedIds.size : 1} prodotti?</h3>
            <p className="muted">L’azione è irreversibile.</p>
            <div className="actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Annulla</button>
              <button className="btn danger" onClick={bulkMode ? deleteSelected : deleteProduct}>Conferma</button>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {showCreateParent ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowCreateParent(false)}>
            <div className="modal parent-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Crea prodotto genitore</h3>
                <button className="btn ghost" onClick={() => setShowCreateParent(false)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-info">
                  <div className="parent-upload">
                    <div
                      className="upload-drop"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (!file) return;
                        setParentImageFile(file);
                        setParentImagePreview(URL.createObjectURL(file));
                      }}
                      onClick={() => parentFileInputRef.current?.click()}
                    >
                      {parentImagePreview ? (
                        <img src={parentImagePreview} alt="Preview" />
                      ) : (
                        <div className="muted">Carica immagine prodotto genitore</div>
                      )}
                      <input
                        ref={parentFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setParentImageFile(file);
                          setParentImagePreview(URL.createObjectURL(file));
                        }}
                        style={{ display: "none" }}
                      />
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        value={parentDraft.name}
                        onChange={(e) => setParentDraft({ ...parentDraft, name: e.target.value })}
                      />
                    </label>
                    <label>
                      SKU
                      <input
                        value={parentDraft.sku}
                        onChange={(e) => setParentDraft({ ...parentDraft, sku: e.target.value })}
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        className="select"
                        value={parentDraft.categoryId || ""}
                        onChange={(e) => setParentDraft({ ...parentDraft, categoryId: e.target.value })}
                      >
                        <option value="">Seleziona categoria</option>
                        {categoryOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="child-toolbar">
                    <div className="child-search">
                      <input
                        placeholder="Cerca per nome, SKU o brand..."
                        value={childSearch}
                        onChange={(e) => setChildSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="select"
                      value={childCategory || ""}
                      onChange={(e) => setChildCategory(e.target.value)}
                    >
                      <option value="">Tutte le categorie</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={childOnlyFree}
                        onChange={(e) => setChildOnlyFree(e.target.checked)}
                      />
                      <span>Solo non assegnati</span>
                    </label>
                  </div>
                  <div className="muted">Seleziona i prodotti figli da associare:</div>
                  <div className="child-list">
                    {filteredChildren.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className={`child-row ${parentChildren.has(p.id) ? "active" : ""}`}
                          onClick={() => {
                            const next = new Set(parentChildren);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            setParentChildren(next);
                          }}
                        >
                          <span className="mono">{p.sku}</span>
                          <span>{p.name}</span>
                          {p.parentId ? <span className="tag">Già figlio</span> : null}
                        </button>
                      ))}
                  </div>
                  <div className="actions">
                    <button className="btn ghost" onClick={() => setShowCreateParent(false)}>
                      Annulla
                    </button>
                    <button className="btn primary" onClick={createParentProduct}>
                      Crea e associa {parentChildren.size} prodotti
                    </button>
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
