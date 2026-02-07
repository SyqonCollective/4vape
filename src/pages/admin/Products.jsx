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
    shortDescription: "",
    description: "",
    price: "",
    listPrice: "",
    purchasePrice: "",
    discountPrice: "",
    discountQty: "",
    taxRateId: "",
    exciseRateId: "",
    vatIncluded: true,
    mlProduct: "",
    nicotine: "",
    codicePl: "",
    barcode: "",
    productType: "",
    visibility: "",
    published: true,
    subcategory: "",
    stockQty: "",
    imageUrl: "",
    categoryId: "",
    parentId: "",
    isParent: false,
    isUnavailable: false,
  });
  const [categories, setCategories] = useState([]);
  const [parents, setParents] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [productFilter, setProductFilter] = useState("all");
  const [showCreateParent, setShowCreateParent] = useState(false);
  const [parentDraft, setParentDraft] = useState({ name: "", sku: "", categoryId: "" });
  const [parentChildren, setParentChildren] = useState(new Set());
  const [childSearch, setChildSearch] = useState("");
  const [childCategory, setChildCategory] = useState("");
  const [childOnlyFree, setChildOnlyFree] = useState(true);
  const [parentImageFile, setParentImageFile] = useState(null);
  const [parentImagePreview, setParentImagePreview] = useState("");
  const [childLinks, setChildLinks] = useState(new Set());
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
    if (fixed.includes("/uploads/") && !fixed.startsWith("/api/") && !fixed.startsWith("/uploads/")) {
      try {
        const parsed = new URL(fixed);
        fixed = parsed.pathname;
      } catch {
        // ignore
      }
    }
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
    const open = Boolean(
      selectedProduct || confirmDelete || showDeleteSuccess || showCreateParent || showBulkEditor
    );
    document.body.classList.toggle("modal-open", open);
    return () => document.body.classList.remove("modal-open");
  }, [selectedProduct, confirmDelete, showDeleteSuccess, showCreateParent, showBulkEditor]);

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
    async function loadRates() {
      try {
        const [taxRes, exciseRes] = await Promise.all([api("/admin/taxes"), api("/admin/excises")]);
        if (!active) return;
        setTaxes(taxRes || []);
        setExcises(exciseRes || []);
      } catch {
        // ignore
      }
    }
    loadRates();
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
      shortDescription: p.shortDescription || "",
      description: p.description || "",
      price: p.price ? Number(p.price).toFixed(2) : "",
      listPrice: p.listPrice ? Number(p.listPrice).toFixed(2) : "",
      purchasePrice: p.purchasePrice ? Number(p.purchasePrice).toFixed(2) : "",
      discountPrice: p.discountPrice ? Number(p.discountPrice).toFixed(2) : "",
      discountQty: p.discountQty ?? "",
      taxRateId: p.taxRateId || "",
      exciseRateId: p.exciseRateId || "",
      vatIncluded: p.vatIncluded !== false,
      mlProduct: p.mlProduct ? Number(p.mlProduct).toFixed(3) : "",
      nicotine: p.nicotine ? Number(p.nicotine).toFixed(3) : "",
      codicePl: p.codicePl || "",
      barcode: p.barcode || "",
      productType: p.productType || "",
      visibility: p.visibility || "",
      published: p.published !== false,
      subcategory: p.subcategory || "",
      stockQty: p.stockQty ?? "",
      imageUrl: p.imageUrl || "",
      categoryId: p.categoryId || "",
      parentId: p.parentId || "",
      isParent: Boolean(p.isParent),
      isUnavailable: Boolean(p.isUnavailable),
    });
    setImages(p.images || []);
    setChildLinks(new Set((p.children || []).map((c) => c.id)));
  }

  async function saveEdit() {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name || undefined,
          shortDescription: edit.shortDescription || undefined,
          description: edit.description || undefined,
          price: edit.price ? Number(edit.price) : undefined,
          listPrice: edit.listPrice ? Number(edit.listPrice) : undefined,
          purchasePrice: edit.purchasePrice ? Number(edit.purchasePrice) : undefined,
          discountPrice: edit.discountPrice ? Number(edit.discountPrice) : undefined,
          discountQty: edit.discountQty !== "" ? Number(edit.discountQty) : undefined,
          taxRateId: edit.taxRateId || undefined,
          exciseRateId: edit.exciseRateId || undefined,
          vatIncluded: edit.vatIncluded,
          mlProduct: edit.mlProduct ? Number(edit.mlProduct) : undefined,
          nicotine: edit.nicotine ? Number(edit.nicotine) : undefined,
          codicePl: edit.codicePl || undefined,
          barcode: edit.barcode || undefined,
          productType: edit.productType || undefined,
          visibility: edit.visibility || undefined,
          published: edit.published,
          subcategory: edit.subcategory || undefined,
          stockQty: edit.stockQty !== "" ? Number(edit.stockQty) : undefined,
          imageUrl: edit.imageUrl || undefined,
          categoryId: edit.categoryId || undefined,
          parentId: edit.parentId || undefined,
          isParent: edit.isParent,
          isUnavailable: edit.isUnavailable,
        }),
      });
      if (edit.isParent) {
        const existingChildIds = new Set((selectedProduct.children || []).map((c) => c.id));
        const toAdd = Array.from(childLinks).filter((id) => !existingChildIds.has(id));
        const toRemove = Array.from(existingChildIds).filter((id) => !childLinks.has(id));
        await Promise.all([
          ...toAdd.map((id) =>
            api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ parentId: selectedProduct.id }) })
          ),
          ...toRemove.map((id) =>
            api(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify({ parentId: null }) })
          ),
        ]);
      }
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

  function generateSku() {
    const sku = String(Math.floor(100000 + Math.random() * 900000));
    setParentDraft((prev) => ({ ...prev, sku }));
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
        try {
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
        } catch {
          // ignore image failure, still create parent and children
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
    if (selectedProduct && p.id === selectedProduct.id) return false;
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

  const filteredItems = items.filter((p) => {
    if (productFilter === "parents") return Boolean(p.isParent);
    if (productFilter === "children") return Boolean(p.parentId || p.parent?.id);
    if (productFilter === "single") return !p.isParent && !(p.parentId || p.parent?.id);
    return true;
  });

  function openBulkEditor() {
    const rows = filteredItems.map((p) => ({
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      price: p.price != null ? Number(p.price).toFixed(2) : "",
      listPrice: p.listPrice != null ? Number(p.listPrice).toFixed(2) : "",
      purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice).toFixed(2) : "",
      discountPrice: p.discountPrice != null ? Number(p.discountPrice).toFixed(2) : "",
      discountQty: p.discountQty ?? "",
      stockQty: p.stockQty ?? "",
      categoryId: p.categoryId || "",
      taxRateId: p.taxRateId || "",
      exciseRateId: p.exciseRateId || "",
      vatIncluded: p.vatIncluded !== false,
      published: p.published !== false,
      isUnavailable: Boolean(p.isUnavailable),
    }));
    setBulkRows(rows);
    setShowBulkEditor(true);
  }

  async function saveBulk() {
    if (bulkRows.length === 0) return;
    setBulkSaving(true);
    setError("");
    try {
      await api("/admin/products/bulk", {
        method: "PATCH",
        body: JSON.stringify({
          items: bulkRows.map((row) => ({
            id: row.id,
            name: row.name?.trim() || null,
            price: row.price === "" ? null : Number(row.price),
            listPrice: row.listPrice === "" ? null : Number(row.listPrice),
            purchasePrice: row.purchasePrice === "" ? null : Number(row.purchasePrice),
            discountPrice: row.discountPrice === "" ? null : Number(row.discountPrice),
            discountQty: row.discountQty === "" ? null : Number(row.discountQty),
            stockQty: row.stockQty === "" ? null : Number(row.stockQty),
            categoryId: row.categoryId || null,
            taxRateId: row.taxRateId || null,
            exciseRateId: row.exciseRateId || null,
            vatIncluded: Boolean(row.vatIncluded),
            published: Boolean(row.published),
            isUnavailable: Boolean(row.isUnavailable),
          })),
        }),
      });
      setShowBulkEditor(false);
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore salvataggio bulk");
    } finally {
      setBulkSaving(false);
    }
  }

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
          <button className="btn ghost" onClick={openBulkEditor}>
            Modifica in bulk
          </button>
          <select
            className="select"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <option value="all">Tutti i prodotti</option>
            <option value="parents">Solo genitori</option>
            <option value="children">Solo figli</option>
            <option value="single">Solo singoli</option>
          </select>
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

      <div className="table wide-12">
        <div className="row header">
          <div>Immagine</div>
          <div>SKU</div>
          <div>Nome</div>
          <div>Prezzo</div>
          <div>Giacenza</div>
          <div>Prodotto</div>
          <div>Padre</div>
          <div>Categoria</div>
          <div>Accisa</div>
          <div>IVA</div>
          <div>Brand</div>
          <div>Fornitore</div>
        </div>
        {filteredItems.map((p) => (
          <div
            className={`row clickable ${p.isUnavailable ? "unavailable" : ""}`}
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
            <div className="name-cell">
              <span>{p.name}</span>
              {p.isParent ? <span className="tag">Padre</span> : null}
              {p.isUnavailable ? <span className="tag danger">Non disponibile</span> : null}
            </div>
            <div>€ {Number(p.price).toFixed(2)}</div>
            <div>{p.stockQty}</div>
            <div>{p.isParent ? "Padre" : p.parentId ? "Figlio" : "Singolo"}</div>
            <div>{p.parent?.name || "-"}</div>
            <div>{p.category || "-"}</div>
            <div>{p.exciseRateRef?.name || (p.exciseTotal != null ? `€ ${Number(p.exciseTotal).toFixed(2)}` : "-")}</div>
            <div>{p.taxRateRef ? `${p.taxRateRef.name} (${Number(p.taxRateRef.rate).toFixed(2)}%)` : "-"}</div>
            <div>{p.brand || "-"}</div>
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
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Modifica prodotto</h3>
              <button className="btn ghost" onClick={() => setSelectedProduct(null)}>Chiudi</button>
            </div>
            <div className="modal-body">
              <div className="modal-media" onClick={(e) => e.stopPropagation()}>
                <div className="cover-wrap">
                  {edit.imageUrl ? (
                    <>
                      <img src={withToken(edit.imageUrl)} alt={edit.name} />
                      <button
                        type="button"
                        className="cover-clear"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEdit((prev) => ({ ...prev, imageUrl: "" }));
                        }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="thumb placeholder large" />
                  )}
                </div>
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
                  <div className="image-grid" onClick={(e) => e.stopPropagation()}>
                    {images.map((img) => (
                      <div className="image-item" key={img.id} onClick={(e) => e.stopPropagation()}>
                        <img src={withToken(img.url)} alt="" />
                        <button
                          type="button"
                          className="image-x"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteImage(img.id);
                          }}
                        >
                          ×
                        </button>
                        <div className="image-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setAsMain(img.url);
                            }}
                          >
                            Copertina
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                    Breve descrizione
                    <input
                      value={edit.shortDescription}
                      onChange={(e) => setEdit({ ...edit, shortDescription: e.target.value })}
                    />
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
                    Prezzo listino
                    <input
                      type="number"
                      step="0.01"
                      value={edit.listPrice}
                      onChange={(e) => setEdit({ ...edit, listPrice: e.target.value })}
                    />
                  </label>
                  <label>
                    Prezzo acquisto
                    <input
                      type="number"
                      step="0.01"
                      value={edit.purchasePrice}
                      onChange={(e) => setEdit({ ...edit, purchasePrice: e.target.value })}
                    />
                  </label>
                  <label>
                    Prezzo scontato
                    <input
                      type="number"
                      step="0.01"
                      value={edit.discountPrice}
                      onChange={(e) => setEdit({ ...edit, discountPrice: e.target.value })}
                    />
                  </label>
                  <label>
                    Q.tà per sconto
                    <input
                      type="number"
                      step="1"
                      value={edit.discountQty}
                      onChange={(e) => setEdit({ ...edit, discountQty: e.target.value })}
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
                    Sottocategoria
                    <input
                      value={edit.subcategory}
                      onChange={(e) => setEdit({ ...edit, subcategory: e.target.value })}
                    />
                  </label>
                  <label>
                    Codice PL
                    <input value={edit.codicePl} onChange={(e) => setEdit({ ...edit, codicePl: e.target.value })} />
                  </label>
                  <label>
                    ML Prodotto
                    <input
                      type="number"
                      step="0.001"
                      value={edit.mlProduct}
                      onChange={(e) => setEdit({ ...edit, mlProduct: e.target.value })}
                    />
                  </label>
                  <label>
                    Nicotina
                    <input
                      type="number"
                      step="0.001"
                      value={edit.nicotine}
                      onChange={(e) => setEdit({ ...edit, nicotine: e.target.value })}
                    />
                  </label>
                  <label>
                    Aliquota IVA
                    <select
                      className="select"
                      value={edit.taxRateId}
                      onChange={(e) => setEdit({ ...edit, taxRateId: e.target.value })}
                    >
                      <option value="">Nessuna</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({Number(t.rate).toFixed(2)}%)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Accisa
                    <select
                      className="select"
                      value={edit.exciseRateId}
                      onChange={(e) => setEdit({ ...edit, exciseRateId: e.target.value })}
                    >
                      <option value="">Nessuna</option>
                      {excises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({Number(e.amount).toFixed(6)} {e.type === "ML" ? "/ml" : ""})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Accisa calcolata
                    <input
                      type="number"
                      step="0.000001"
                      value={selectedProduct.exciseTotal ? Number(selectedProduct.exciseTotal).toFixed(6) : ""}
                      disabled
                    />
                  </label>
                  <label>
                    IVA inclusa
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.vatIncluded}
                        onChange={(e) => setEdit({ ...edit, vatIncluded: e.target.checked })}
                      />
                      <span>{edit.vatIncluded ? "Inclusa" : "Esclusa"}</span>
                    </div>
                  </label>
                  <label>
                    IVA calcolata
                    <input
                      type="number"
                      step="0.000001"
                      value={selectedProduct.taxAmount ? Number(selectedProduct.taxAmount).toFixed(6) : ""}
                      disabled
                    />
                  </label>
                  <label>
                    Tipo prodotto
                    <input
                      value={edit.productType}
                      onChange={(e) => setEdit({ ...edit, productType: e.target.value })}
                    />
                  </label>
                  <label>
                    Visibilità
                    <input
                      value={edit.visibility}
                      onChange={(e) => setEdit({ ...edit, visibility: e.target.value })}
                    />
                  </label>
                  <label>
                    Pubblicato
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.published}
                        onChange={(e) => setEdit({ ...edit, published: e.target.checked })}
                      />
                      <span>{edit.published ? "Visibile" : "Nascosto"}</span>
                    </div>
                  </label>
                  <label>
                    Barcode
                    <input value={edit.barcode} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} />
                  </label>
                  <label>
                    Prodotto padre
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.isParent}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEdit({
                            ...edit,
                            isParent: checked,
                            parentId: checked ? "" : edit.parentId,
                          });
                          if (!checked) {
                            setChildLinks(new Set());
                          }
                        }}
                      />
                      <span>Non vendibile</span>
                    </div>
                    <div className="muted">Per creare un nuovo genitore usa “Crea prodotto genitore”.</div>
                  </label>
                  <label>
                    Non disponibile
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.isUnavailable}
                        onChange={(e) => setEdit({ ...edit, isUnavailable: e.target.checked, stockQty: 0 })}
                      />
                      <span>Forza giacenza a 0</span>
                    </div>
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
                      disabled={selectedProduct.source === "SUPPLIER" || edit.isParent || edit.isUnavailable}
                    />
                    {selectedProduct.source === "SUPPLIER" ? (
                      <div className="muted">La giacenza è sincronizzata dal fornitore</div>
                    ) : null}
                    {edit.isParent ? <div className="muted">Prodotto padre non vendibile</div> : null}
                    {edit.isUnavailable ? <div className="muted">Prodotto non disponibile</div> : null}
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
                {edit.isParent ? (
                  <div className="child-assignment">
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
                          className={`child-row ${childLinks.has(p.id) ? "active" : ""}`}
                          onClick={() => {
                            const next = new Set(childLinks);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            setChildLinks(next);
                          }}
                        >
                          <span className="mono">{p.sku}</span>
                          <span>{p.name}</span>
                          {p.parentId ? <span className="tag">Già figlio</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                      <div className="input-row">
                        <input
                          value={parentDraft.sku}
                          onChange={(e) => setParentDraft({ ...parentDraft, sku: e.target.value })}
                        />
                        <button type="button" className="btn ghost" onClick={generateSku}>
                          Genera SKU
                        </button>
                      </div>
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

      {showBulkEditor ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowBulkEditor(false)}>
            <div className="modal bulk-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Modifica in bulk</h3>
                <button className="btn ghost" onClick={() => setShowBulkEditor(false)}>
                  Chiudi
                </button>
              </div>
              <div className="bulk-subtitle muted">
                {bulkRows.length} prodotti — modifica stile Excel
              </div>
              <div className="bulk-table">
                <div className="bulk-row header">
                  <div>SKU</div>
                  <div>Nome</div>
                  <div>Prezzo</div>
                  <div>Listino</div>
                  <div>Acquisto</div>
                  <div>Sconto</div>
                  <div>Q.tà Sconto</div>
                  <div>Giacenza</div>
                  <div>Categoria</div>
                  <div>IVA</div>
                  <div>Accisa</div>
                  <div>IVA incl.</div>
                  <div>Pubblicato</div>
                  <div>Non disp.</div>
                </div>
                {bulkRows.map((row, idx) => (
                  <div className="bulk-row" key={row.id}>
                    <div className="mono">{row.sku}</div>
                    <input
                      value={row.name}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, name: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, price: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={row.listPrice}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, listPrice: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={row.purchasePrice}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, purchasePrice: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={row.discountPrice}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, discountPrice: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="1"
                      value={row.discountQty}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, discountQty: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <input
                      type="number"
                      step="1"
                      value={row.stockQty}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, stockQty: e.target.value };
                        setBulkRows(next);
                      }}
                    />
                    <select
                      value={row.categoryId}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, categoryId: e.target.value };
                        setBulkRows(next);
                      }}
                    >
                      <option value="">-</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.taxRateId}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, taxRateId: e.target.value };
                        setBulkRows(next);
                      }}
                    >
                      <option value="">-</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.exciseRateId}
                      onChange={(e) => {
                        const next = [...bulkRows];
                        next[idx] = { ...row, exciseRateId: e.target.value };
                        setBulkRows(next);
                      }}
                    >
                      <option value="">-</option>
                      {excises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={row.vatIncluded}
                        onChange={(e) => {
                          const next = [...bulkRows];
                          next[idx] = { ...row, vatIncluded: e.target.checked };
                          setBulkRows(next);
                        }}
                      />
                      <span />
                    </label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={row.published}
                        onChange={(e) => {
                          const next = [...bulkRows];
                          next[idx] = { ...row, published: e.target.checked };
                          setBulkRows(next);
                        }}
                      />
                      <span />
                    </label>
                    <label className="switch danger">
                      <input
                        type="checkbox"
                        checked={row.isUnavailable}
                        onChange={(e) => {
                          const next = [...bulkRows];
                          next[idx] = { ...row, isUnavailable: e.target.checked };
                          setBulkRows(next);
                        }}
                      />
                      <span />
                    </label>
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setShowBulkEditor(false)}>
                  Annulla
                </button>
                <button className="btn primary" onClick={saveBulk} disabled={bulkSaving}>
                  {bulkSaving ? "Salvataggio..." : "Salva modifiche"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
