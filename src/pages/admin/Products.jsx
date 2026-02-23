import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import trashAnim from "../../assets/Trash clean.json";
import { api, getToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

// CHECKLIST (admin richieste):
// [x] Import CSV giacenza (alias quantità supportati lato API)
// [x] Breve descrizione sopra descrizione con stesso editor rich text
// [x] Scheda prodotto aperta più ampia (quasi full-screen)

function RichTextEditor({ value, onChange, placeholder = "Scrivi la descrizione..." }) {
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

  function onAddLink() {
    const url = window.prompt("Inserisci URL (https://...)");
    if (!url) return;
    run("createLink", url.trim());
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" onClick={() => run("bold")} title="Grassetto">
          B
        </button>
        <button type="button" className="rte-btn" onClick={() => run("italic")} title="Corsivo">
          I
        </button>
        <button type="button" className="rte-btn" onClick={() => run("underline")} title="Sottolineato">
          U
        </button>
        <button type="button" className="rte-btn" onClick={() => run("insertUnorderedList")} title="Elenco puntato">
          • List
        </button>
        <button type="button" className="rte-btn" onClick={() => run("insertOrderedList")} title="Elenco numerato">
          1. List
        </button>
        <button type="button" className="rte-btn" onClick={onAddLink} title="Aggiungi link">
          Link
        </button>
        <button type="button" className="rte-btn" onClick={() => run("removeFormat")} title="Rimuovi formattazione">
          Clear
        </button>
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
    vatIncluded: false,
    mlProduct: "",
    nicotine: "",
    codicePl: "",
    barcode: "",
    brand: "",
    aroma: "",
    published: true,
    subcategory: "",
    subcategories: [],
    categoryIds: [],
    stockQty: "",
    imageUrl: "",
    categoryId: "",
    parentId: "",
    isParent: false,
    sellAsSingle: false,
    isUnavailable: false,
    relatedProductIds: [],
  });
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [customerPrices, setCustomerPrices] = useState([]);
  const [companyPriceDraft, setCompanyPriceDraft] = useState({ companyId: "", price: "" });
  const [parents, setParents] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [vatRateDefault, setVatRateDefault] = useState("");
  const [defaultTaxRateId, setDefaultTaxRateId] = useState("");
  const [images, setImages] = useState([]);
  const [editValidation, setEditValidation] = useState({});
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState(new Set());
  const [bulkCollapsedParents, setBulkCollapsedParents] = useState(new Set());
  const [bulkDragOver, setBulkDragOver] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created-desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [pageSize, setPageSize] = useState("50");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateParent, setShowCreateParent] = useState(false);
  const [showCreateManual, setShowCreateManual] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [parentDraft, setParentDraft] = useState({ name: "", sku: "", categoryId: "" });
  const [manualDraft, setManualDraft] = useState({
    name: "",
    sku: "",
    price: "",
    stockQty: "",
    brand: "",
    aroma: "",
    categoryId: "",
    subcategory: "",
    shortDescription: "",
    description: "",
    purchasePrice: "",
    listPrice: "",
    discountPrice: "",
    discountQty: "",
    mlProduct: "",
    nicotine: "",
    taxRateId: "",
    exciseRateId: "",
    barcode: "",
  });
  const [parentChildren, setParentChildren] = useState(new Set());
  const [childSearch, setChildSearch] = useState("");
  const [childCategory, setChildCategory] = useState("");
  const [childOnlyFree, setChildOnlyFree] = useState(true);
  const [parentImageFile, setParentImageFile] = useState(null);
  const [parentImagePreview, setParentImagePreview] = useState("");
  const [manualImageFile, setManualImageFile] = useState(null);
  const [manualImagePreview, setManualImagePreview] = useState("");
  const [childLinks, setChildLinks] = useState(new Set());
  const [relatedSearch, setRelatedSearch] = useState("");
  const token = getToken();
  const fileInputRef = useRef(null);
  const parentFileInputRef = useRef(null);
  const manualFileInputRef = useRef(null);
  const csvInputRef = useRef(null);
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
  const topCategoryOptions = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const categoryChildrenMap = categories.reduce((acc, c) => {
    if (!c.parentId) return acc;
    const list = acc.get(c.parentId) || [];
    list.push(c);
    acc.set(c.parentId, list);
    return acc;
  }, new Map());
  const editSubcategoryOptions = Array.from(
    new Map(
      (edit.categoryIds || [])
        .flatMap((id) => categoryChildrenMap.get(id) || [])
        .map((c) => [c.id, c])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const manualSubcategoryOptions = (categoryChildrenMap.get(manualDraft.categoryId) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const parentOptions = parents.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  const brandOptions = Array.from(
    new Set([...brands, ...items.map((p) => p.brand).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b));
  const relatedCandidates = items
    .filter((p) => {
      if (!selectedProduct) return false;
      if (p.id === selectedProduct.id) return false;
      if (p.isParent) return true;
      return Boolean(p.sellAsSingle);
    })
    .filter((p) => {
      const q = relatedSearch.trim().toLowerCase();
      if (!q) return true;
      return `${p.sku || ""} ${p.name || ""} ${p.brand || ""}`.toLowerCase().includes(q);
    })
    .slice(0, 100);
  const relatedSelected = (edit.relatedProductIds || [])
    .map((id) => items.find((p) => p.id === id))
    .filter(Boolean);
  const selectedTax = taxes.find((t) => t.id === edit.taxRateId);
  const selectedExcise = excises.find((e) => e.id === edit.exciseRateId);
  const basePrice = edit.price ? Number(edit.price) : 0;
  const mlValue = edit.mlProduct ? Number(edit.mlProduct) : 0;
  const exciseComputed =
    selectedExcise?.type === "ML"
      ? Number(selectedExcise.amount) * mlValue
      : selectedExcise
      ? Number(selectedExcise.amount)
      : 0;
  const vatComputed = selectedTax ? (basePrice * Number(selectedTax.rate)) / 100 : 0;
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

  async function reloadProducts() {
    try {
      const res = await api("/admin/products");
      setItems(res);
    } catch {
      setError("Impossibile caricare i prodotti");
    }
  }

  async function runProductsSearch() {
    const q = searchTerm.trim();
    try {
      if (!q) {
        await reloadProducts();
        return;
      }
      const res = await api(`/admin/products?q=${encodeURIComponent(q)}&limit=800&orderBy=created-desc`);
      setItems(res || []);
      setCurrentPage(1);
      setCollapsedParents(new Set());
    } catch {
      setError("Ricerca prodotti non riuscita");
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      runProductsSearch();
    }, 260);
    return () => clearTimeout(t);
  }, [searchTerm]);

  async function exportCsv() {
    try {
      const res = await fetch("/api/admin/products/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "products_export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Errore export CSV");
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setImportingCsv(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error();
      const summary = await res.json();
      setImportSummary(summary);
      await reloadProducts();
    } catch {
      setError("Errore import CSV");
    } finally {
      setImportingCsv(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
      setShowImportConfirm(false);
      setImportFile(null);
    }
  }

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
    async function loadCompanies() {
      try {
        const res = await api("/admin/companies");
        if (!active) return;
        setCompanies((res || []).filter((c) => c.status === "ACTIVE"));
      } catch {
        // ignore
      }
    }
    loadCompanies();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [productFilter, sortBy, searchTerm, categoryFilter, brandFilter, pageSize]);

  useEffect(() => {
    let active = true;
    async function loadBrands() {
      try {
        const res = await api("/admin/brands");
        if (!active) return;
        setBrands((res || []).map((x) => x.name).filter(Boolean));
      } catch {
        // ignore
      }
    }
    loadBrands();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const res = await api("/admin/settings");
        if (!active) return;
        setVatRateDefault(res?.vatRateDefault ? String(res.vatRateDefault) : "");
      } catch {
        // ignore
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await api("/admin/products/stock");
        if (!active) return;
        const map = new Map(res.map((r) => [r.id, r]));
        setItems((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            const upd = map.get(p.id);
            if (!upd) return p;
            const prevStock = p.stockQty == null ? null : Number(p.stockQty);
            const nextStock = upd.stockQty == null ? null : Number(upd.stockQty);
            if (prevStock === nextStock && p.isUnavailable === upd.isUnavailable) return p;
            changed = true;
            return { ...p, stockQty: upd.stockQty, isUnavailable: upd.isUnavailable };
          });
          return changed ? next : prev;
        });
      } catch {
        // ignore stock refresh errors
      }
    }, 10000);
    return () => {
      active = false;
      clearInterval(interval);
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
    if (!vatRateDefault || taxes.length === 0) return;
    const rate = Number(vatRateDefault);
    if (!Number.isFinite(rate)) return;
    const match = taxes.find((t) => Number(t.rate) === rate);
    if (match && match.id !== defaultTaxRateId) {
      setDefaultTaxRateId(match.id);
      setManualDraft((prev) => (prev.taxRateId ? prev : { ...prev, taxRateId: match.id }));
    }
  }, [vatRateDefault, taxes, defaultTaxRateId]);

  async function loadCustomerPrices(productId) {
    try {
      const res = await api(`/admin/products/${productId}/customer-prices`);
      setCustomerPrices(res || []);
    } catch {
      setCustomerPrices([]);
    }
  }

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
    setEditValidation({});
    setEdit({
      name: p.name || "",
      shortDescription: p.shortDescription || "",
      description: p.description || "",
      price: p.price ? Number(p.price).toFixed(2) : "",
      listPrice: p.listPrice ? Number(p.listPrice).toFixed(2) : "",
      purchasePrice: p.purchasePrice ? Number(p.purchasePrice).toFixed(2) : "",
      discountPrice: p.discountPrice ? Number(p.discountPrice).toFixed(2) : "",
      discountQty: p.discountQty ?? "",
      taxRateId: p.taxRateId || defaultTaxRateId || "",
      exciseRateId: p.exciseRateId || "",
      vatIncluded: true,
      mlProduct: p.mlProduct ? Number(p.mlProduct).toFixed(3) : "",
      nicotine: p.nicotine ? Number(p.nicotine).toFixed(3) : "",
      codicePl: p.codicePl || "",
      barcode: p.barcode || "",
      brand: p.brand || "",
      aroma: p.aroma || "",
      published: p.published !== false,
      subcategory: p.subcategory || "",
      subcategories:
        Array.isArray(p.subcategories) && p.subcategories.length
          ? p.subcategories
          : p.subcategory
            ? [p.subcategory]
            : [],
      stockQty: p.stockQty ?? "",
      imageUrl: p.imageUrl || "",
      categoryId: p.categoryId || "",
      categoryIds:
        Array.isArray(p.categoryIds) && p.categoryIds.length
          ? p.categoryIds
          : p.categoryId
            ? [p.categoryId]
            : [],
      parentId: p.parentId || "",
      isParent: Boolean(p.isParent),
      sellAsSingle:
        p.sellAsSingle !== undefined ? Boolean(p.sellAsSingle) : Boolean((p.parentId || p.parent?.id) && p.price != null),
      isUnavailable: Boolean(p.isUnavailable),
      relatedProductIds: Array.isArray(p.relatedProductIds) ? p.relatedProductIds : [],
    });
    setImages(p.images || []);
    setChildLinks(new Set((p.children || []).map((c) => c.id)));
    setRelatedSearch("");
    setCompanyPriceDraft({ companyId: "", price: "" });
    loadCustomerPrices(p.id);
  }

  async function saveCompanyPrice() {
    if (!selectedProduct) return;
    if (!companyPriceDraft.companyId || !companyPriceDraft.price) return;
    try {
      await api(`/admin/products/${selectedProduct.id}/customer-prices/${companyPriceDraft.companyId}`, {
        method: "PUT",
        body: JSON.stringify({ price: Number(companyPriceDraft.price) }),
      });
      setCompanyPriceDraft({ companyId: "", price: "" });
      await loadCustomerPrices(selectedProduct.id);
    } catch {
      setError("Errore salvataggio prezzo cliente");
    }
  }

  async function removeCompanyPrice(companyId) {
    if (!selectedProduct) return;
    try {
      await api(`/admin/products/${selectedProduct.id}/customer-prices/${companyId}`, { method: "DELETE" });
      await loadCustomerPrices(selectedProduct.id);
    } catch {
      setError("Errore rimozione prezzo cliente");
    }
  }

  async function saveEdit(forcePublish = false) {
    if (!selectedProduct) return;
    const nextValidation = {
      categoryId: !(edit.categoryIds || []).length,
      subcategory: !(edit.subcategories || []).length,
    };
    if (nextValidation.categoryId || nextValidation.subcategory) {
      setEditValidation(nextValidation);
      setError("Compila i campi obbligatori: Categoria e Sottocategoria.");
      return;
    }
    try {
      setEditValidation({});
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
          vatIncluded: true,
          mlProduct: edit.mlProduct ? Number(edit.mlProduct) : undefined,
          nicotine: edit.nicotine ? Number(edit.nicotine) : undefined,
          codicePl: edit.codicePl || undefined,
          barcode: edit.barcode || undefined,
          brand: edit.brand || undefined,
          aroma: edit.aroma || undefined,
          published: forcePublish ? true : edit.published,
          categoryIds: edit.categoryIds || [],
          subcategories: edit.subcategories || [],
          stockQty: edit.stockQty !== "" ? Number(edit.stockQty) : undefined,
          imageUrl: edit.imageUrl || undefined,
          categoryId: edit.categoryId || undefined,
          parentId: edit.parentId || undefined,
          isParent: edit.isParent,
          sellAsSingle: edit.sellAsSingle,
          isUnavailable: edit.isUnavailable,
          relatedProductIds:
            edit.isParent || edit.sellAsSingle
              ? (edit.relatedProductIds || []).filter((id) => id !== selectedProduct.id)
              : [],
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

  function generateManualSku() {
    const sku = String(Math.floor(100000 + Math.random() * 900000));
    setManualDraft((prev) => ({ ...prev, sku }));
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
          taxRateId: defaultTaxRateId || undefined,
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

  async function createManualProduct() {
    if (!manualDraft.name.trim() || !manualDraft.sku.trim()) {
      setError("Nome e SKU sono obbligatori");
      return;
    }
    if (!manualDraft.price) {
      setError("Prezzo obbligatorio");
      return;
    }
    if (!manualDraft.categoryId || !manualDraft.subcategory) {
      setError("Categoria e sottocategoria sono obbligatorie");
      return;
    }
    try {
      const product = await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          name: manualDraft.name.trim(),
          sku: manualDraft.sku.trim(),
          price: Number(manualDraft.price),
          stockQty: manualDraft.stockQty ? Number(manualDraft.stockQty) : 0,
          brand: manualDraft.brand || undefined,
          aroma: manualDraft.aroma || undefined,
          categoryId: manualDraft.categoryId || undefined,
          subcategory: manualDraft.subcategory || undefined,
          shortDescription: manualDraft.shortDescription || undefined,
          description: manualDraft.description || undefined,
          purchasePrice: manualDraft.purchasePrice ? Number(manualDraft.purchasePrice) : undefined,
          listPrice: manualDraft.listPrice ? Number(manualDraft.listPrice) : undefined,
          discountPrice: manualDraft.discountPrice ? Number(manualDraft.discountPrice) : undefined,
          discountQty: manualDraft.discountQty ? Number(manualDraft.discountQty) : undefined,
          mlProduct: manualDraft.mlProduct ? Number(manualDraft.mlProduct) : undefined,
          nicotine: manualDraft.nicotine ? Number(manualDraft.nicotine) : undefined,
          taxRateId: manualDraft.taxRateId || defaultTaxRateId || undefined,
          exciseRateId: manualDraft.exciseRateId || undefined,
          barcode: manualDraft.barcode || undefined,
        }),
      });
      if (manualImageFile) {
        const form = new FormData();
        form.append("files", manualImageFile);
        const res = await fetch(`/api/admin/products/${product.id}/images`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          const first = data?.items?.[0];
          if (first?.url) {
            await api(`/admin/products/${product.id}`, {
              method: "PATCH",
              body: JSON.stringify({ imageUrl: first.url }),
            });
          }
        }
      }
      setShowCreateManual(false);
      setManualDraft({
        name: "",
        sku: "",
        price: "",
        stockQty: "",
        brand: "",
        aroma: "",
        categoryId: "",
        subcategory: "",
        shortDescription: "",
        description: "",
        purchasePrice: "",
        listPrice: "",
        discountPrice: "",
        discountQty: "",
        mlProduct: "",
        nicotine: "",
        taxRateId: defaultTaxRateId || "",
        exciseRateId: "",
        barcode: "",
      });
      setManualImageFile(null);
      setManualImagePreview("");
      const res = await api("/admin/products");
      setItems(res);
    } catch (err) {
      setError("Errore creazione prodotto manuale");
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
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      const blob = `${p.sku || ""} ${p.name || ""} ${p.brand || ""} ${p.category || ""} ${p.subcategory || ""}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (brandFilter && (p.brand || "") !== brandFilter) return false;
    if (categoryFilter) {
      const ids = Array.isArray(p.categoryIds) ? p.categoryIds : p.categoryId ? [p.categoryId] : [];
      if (!ids.includes(categoryFilter)) return false;
    }
    if (productFilter === "parents") return Boolean(p.isParent);
    if (productFilter === "children") return Boolean(p.parentId || p.parent?.id);
    if (productFilter === "single") {
      if (p.isParent) return false;
      if (p.parentId || p.parent?.id) {
        return Boolean(p.sellAsSingle) && p.price != null;
      }
      return p.price != null;
    }
    if (productFilter === "draft") return p.published === false;
    return true;
  });

  const sortItems = (list) => {
    const itemsCopy = [...list];
    const byText = (a, b, key, dir = "asc") => {
      const av = (a[key] || "").toString().toLowerCase();
      const bv = (b[key] || "").toString().toLowerCase();
      const cmp = av.localeCompare(bv);
      return dir === "asc" ? cmp : -cmp;
    };
    const byNumber = (a, b, key, dir = "asc") => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      const cmp = av - bv;
      return dir === "asc" ? cmp : -cmp;
    };
    switch (sortBy) {
      case "created-desc":
        return itemsCopy.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      case "created-asc":
        return itemsCopy.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      case "name-desc":
        return itemsCopy.sort((a, b) => byText(a, b, "name", "desc"));
      case "sku-asc":
        return itemsCopy.sort((a, b) => byText(a, b, "sku", "asc"));
      case "sku-desc":
        return itemsCopy.sort((a, b) => byText(a, b, "sku", "desc"));
      case "price-asc":
        return itemsCopy.sort((a, b) => byNumber(a, b, "price", "asc"));
      case "price-desc":
        return itemsCopy.sort((a, b) => byNumber(a, b, "price", "desc"));
      case "stock-asc":
        return itemsCopy.sort((a, b) => byNumber(a, b, "stockQty", "asc"));
      case "stock-desc":
        return itemsCopy.sort((a, b) => byNumber(a, b, "stockQty", "desc"));
      case "brand-asc":
        return itemsCopy.sort((a, b) => byText(a, b, "brand", "asc"));
      case "brand-desc":
        return itemsCopy.sort((a, b) => byText(a, b, "brand", "desc"));
      case "supplier-asc":
        return itemsCopy.sort((a, b) => {
          const av = (a.sourceSupplier?.name || "").toLowerCase();
          const bv = (b.sourceSupplier?.name || "").toLowerCase();
          return av.localeCompare(bv);
        });
      case "supplier-desc":
        return itemsCopy.sort((a, b) => {
          const av = (a.sourceSupplier?.name || "").toLowerCase();
          const bv = (b.sourceSupplier?.name || "").toLowerCase();
          return bv.localeCompare(av);
        });
      default:
        return itemsCopy.sort((a, b) => byText(a, b, "name", "asc"));
    }
  };

  const groupedRows = (() => {
    if (productFilter !== "all") {
      return sortItems(filteredItems).map((p) => ({ type: "single", item: p }));
    }

    const byParent = new Map();
    const singles = [];
    const baseItems = filteredItems;
    const parentsOnly = sortItems(baseItems.filter((p) => p.isParent));
    for (const parent of parentsOnly) {
      byParent.set(parent.id, []);
    }
    for (const item of baseItems) {
      if (item.isParent) continue;
      const parentId = item.parentId || item.parent?.id;
      if (parentId && byParent.has(parentId)) {
        byParent.get(parentId).push(item);
      } else {
        singles.push(item);
      }
    }
    const rows = [];
    for (const parent of parentsOnly) {
      rows.push({ type: "parent", item: parent });
      if (!collapsedParents.has(parent.id)) {
        const children = (byParent.get(parent.id) || []).sort((a, b) => {
          const orderDiff = (a.parentSort ?? 0) - (b.parentSort ?? 0);
          if (orderDiff !== 0) return orderDiff;
          const an = a.name || "";
          const bn = b.name || "";
          return an.localeCompare(bn);
        });
        for (const child of children) {
          rows.push({ type: "child", item: child, parent });
        }
      }
    }
    for (const single of sortItems(singles)) {
      rows.push({ type: "single", item: single });
    }
    return rows;
  })();

  const totalRows = groupedRows.length;
  const effectivePageSize = pageSize === "all" ? totalRows || 1 : Number(pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(totalRows / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * effectivePageSize;
  const pagedRows = groupedRows.slice(pageStart, pageStart + effectivePageSize);

  const dash = <span className="cell-muted">—</span>;

  function toggleSelectAllPage() {
    const ids = Array.from(new Set(pagedRows.map((row) => row.item.id)));
    const allSelected = ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  }

  function openBulkEditor() {
    const sourceItems =
      productFilter === "draft"
        ? items.filter((p) => p.published === false)
        : filteredItems;
    const rows = sourceItems.map((p) => ({
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      price: p.price != null ? Number(p.price).toFixed(2) : "",
      listPrice: p.listPrice != null ? Number(p.listPrice).toFixed(2) : "",
      purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice).toFixed(2) : "",
      discountPrice: p.discountPrice != null ? Number(p.discountPrice).toFixed(2) : "",
      discountQty: p.discountQty ?? "",
      stockQty: p.stockQty ?? "",
      nicotine: p.nicotine != null ? Number(p.nicotine).toFixed(3) : "",
      categoryId: p.categoryId || "",
      taxRateId: p.taxRateId || "",
      exciseRateId: p.exciseRateId || "",
      vatIncluded: true,
      published: p.published !== false,
      isUnavailable: Boolean(p.isUnavailable),
      isParent: Boolean(p.isParent),
      sellAsSingle:
        p.sellAsSingle !== undefined ? Boolean(p.sellAsSingle) : Boolean((p.parentId || p.parent?.id) && p.price != null),
      parentId: p.parentId || p.parent?.id || "",
      isDraftRow: p.published === false,
      parentSort: p.parentSort ?? 0,
    }));
    setBulkRows(rows);
    setShowBulkEditor(true);
  }

  async function saveBulk(forcePublish = false) {
    if (bulkRows.length === 0) return;
    setBulkSaving(true);
    setError("");
    try {
      const rowsToSave =
        productFilter === "draft"
          ? bulkRows.filter((row) => row.isDraftRow)
          : bulkRows;
      const orderMap = new Map();
      const byParent = new Map();
      for (const row of rowsToSave) {
        const parentId = row.parentId || "";
        if (!parentId) continue;
        const list = byParent.get(parentId) || [];
        list.push(row.id);
        byParent.set(parentId, list);
      }
      for (const [parentId, ids] of byParent) {
        ids.forEach((id, idx) => orderMap.set(id, idx));
      }
      const parentCategoryMap = new Map();
      for (const row of rowsToSave) {
        if (row.isParent && row.categoryId) {
          parentCategoryMap.set(row.id, row.categoryId);
        }
      }
      await api("/admin/products/bulk", {
        method: "PATCH",
        body: JSON.stringify({
          items: rowsToSave.map((row) => ({
            id: row.id,
            name: row.name?.trim() || null,
            price: row.price === "" ? null : Number(row.price),
            listPrice: row.listPrice === "" ? null : Number(row.listPrice),
            purchasePrice: row.purchasePrice === "" ? null : Number(row.purchasePrice),
            discountPrice: row.discountPrice === "" ? null : Number(row.discountPrice),
            discountQty: row.discountQty === "" ? null : Number(row.discountQty),
            stockQty: row.stockQty === "" ? null : Number(row.stockQty),
            nicotine: row.nicotine === "" ? null : Number(row.nicotine),
            categoryId:
              row.categoryId ||
              (row.parentId && parentCategoryMap.get(row.parentId)) ||
              null,
            taxRateId: row.taxRateId || null,
            exciseRateId: row.exciseRateId || null,
            vatIncluded: true,
            published: productFilter === "draft" ? (forcePublish ? true : false) : Boolean(row.published),
            isUnavailable: Boolean(row.isUnavailable),
            isParent: Boolean(row.isParent),
            sellAsSingle: Boolean(row.sellAsSingle),
            parentId: row.parentId || null,
            parentSort: orderMap.has(row.id) ? orderMap.get(row.id) : row.parentSort ?? 0,
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
      </div>

      <div className="products-toolbar">
        <div className="toolbar-left">
          <button className="btn primary" onClick={() => setShowCreateParent(true)}>
            Crea prodotto genitore
          </button>
          <button className="btn ghost" onClick={() => setShowCreateManual(true)}>
            Crea prodotto manuale
          </button>
          <button className="btn ghost" onClick={openBulkEditor}>
            Modifica in bulk
          </button>
          <button className="btn ghost" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn ghost" onClick={() => csvInputRef.current?.click()} disabled={importingCsv}>
            {importingCsv ? "Importazione..." : "Import CSV"}
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImportFile(file);
              setShowImportConfirm(true);
            }}
          />
        </div>
        <div className="toolbar-right">
          <div className="toolbar-group" style={{ minWidth: 260 }}>
            <div className="toolbar-label">Cerca</div>
            <input
              placeholder="SKU, nome, brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runProductsSearch();
                }
              }}
            />
            <button className="btn ghost" onClick={runProductsSearch}>Aggiorna</button>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-label">Ordina per</div>
            <select
              className="select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name-asc">Nome (A-Z)</option>
              <option value="name-desc">Nome (Z-A)</option>
              <option value="created-desc">Novità (più recenti)</option>
              <option value="created-asc">Prime creazioni</option>
              <option value="sku-asc">SKU (A-Z)</option>
              <option value="sku-desc">SKU (Z-A)</option>
              <option value="price-asc">Prezzo (crescente)</option>
              <option value="price-desc">Prezzo (decrescente)</option>
              <option value="stock-asc">Giacenza (crescente)</option>
              <option value="stock-desc">Giacenza (decrescente)</option>
              <option value="brand-asc">Brand (A-Z)</option>
              <option value="brand-desc">Brand (Z-A)</option>
            </select>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-label">Filtro</div>
            <select
              className="select"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            >
              <option value="all">Tutti i prodotti</option>
              <option value="parents">Solo genitori</option>
              <option value="children">Solo figli</option>
              <option value="single">Solo singoli</option>
              <option value="draft">Solo draft</option>
            </select>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-label">Categoria</div>
            <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Tutte</option>
              {topCategoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-label">Marchio</div>
            <select className="select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="">Tutti</option>
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-group">
            <div className="toolbar-label">Vista</div>
            <select className="select" value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="all">Tutti</option>
            </select>
          </div>
          <div className="toolbar-group compact">
            <button className={`btn ${bulkMode ? "primary" : "ghost"}`} onClick={() => setBulkMode(!bulkMode)}>
              {bulkMode ? "Selezione attiva" : "Multi selection"}
            </button>
            {bulkMode ? (
              <button className="btn ghost" onClick={toggleSelectAllPage}>
                Seleziona tutti in pagina
              </button>
            ) : null}
            {bulkMode ? (
              <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={selectedIds.size === 0}>
                Elimina selezionati
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel products-panel">
      <div className="table wide-10">
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
          <div>Brand</div>
        </div>
        {pagedRows.map((row) => {
          const p = row.item;
          const isChild = row.type === "child";
          const isParentRow = row.type === "parent";
          const isChildSingle =
            Boolean(p.parentId || p.parent?.id) &&
            Boolean(p.sellAsSingle) &&
            p.price != null;
          const categoriesLabel = Array.isArray(p.categoryIds) && p.categoryIds.length
            ? (p.categoryIds
                .map((id) => topCategoryOptions.find((c) => c.id === id)?.name)
                .filter(Boolean)
                .join(", ") || p.category || dash)
            : (p.category || dash);
          const subcategoriesLabel = Array.isArray(p.subcategories) && p.subcategories.length
            ? p.subcategories.join(", ")
            : (p.subcategory || "");
          return (
          <div
            className={`row clickable ${p.isUnavailable ? "unavailable" : ""} ${p.published === false ? "draft" : ""} ${isChild ? "child-row" : ""} ${isParentRow ? "parent-row" : ""}`}
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
            <div className="thumb-cell">
              {isParentRow ? (
                <button
                  type="button"
                  className="collapse-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = new Set(collapsedParents);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    setCollapsedParents(next);
                  }}
                >
                  {collapsedParents.has(p.id) ? "+" : "−"}
                </button>
              ) : (
                <span className="collapse-spacer" />
              )}
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
              {isChildSingle ? <span className="tag info">Figlio+singolo</span> : null}
              {p.isUnavailable ? <span className="tag danger">Non disponibile</span> : null}
              {p.published === false ? <span className="tag warn">Draft</span> : null}
            </div>
            <div>{isParentRow && p.price == null ? dash : `€ ${Number(p.price).toFixed(2)}`}</div>
            <div>{isParentRow && p.price == null ? dash : p.stockQty}</div>
            <div>
              {isParentRow ? "Padre" : isChildSingle ? "Figlio+singolo" : p.parentId ? "Figlio" : "Singolo"}
            </div>
            <div>{row.parent?.sku || p.parent?.sku || dash}</div>
            <div>
              <div>{categoriesLabel}</div>
              {subcategoriesLabel ? <div className="muted">{subcategoriesLabel}</div> : null}
            </div>
            <div className="excise-cell">
              {p.exciseRateRef?.name || (p.exciseTotal != null ? `€ ${Number(p.exciseTotal).toFixed(2)}` : dash)}
            </div>
            <div>{p.brand || dash}</div>
          </div>
        );
        })}
      </div>
      </div>
      <div className="pagination">
        <button
          className="page-btn ghost"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <span className="page-dots">
          Pagina {safePage} / {totalPages} · {totalRows} risultati
        </span>
        <button
          className="page-btn ghost"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
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
                <div className="customer-price-panel">
                  <div className="customer-price-header">
                    <div className="card-title" style={{ marginBottom: 0 }}>Prezzo dedicato per cliente</div>
                    <div className="muted">Override prezzo solo per cliente selezionato</div>
                  </div>
                  <div className="customer-price-form">
                    <select
                      className="select"
                      value={companyPriceDraft.companyId}
                      onChange={(e) => setCompanyPriceDraft((p) => ({ ...p, companyId: e.target.value }))}
                    >
                      <option value="">Seleziona cliente</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Prezzo"
                      value={companyPriceDraft.price}
                      onChange={(e) => setCompanyPriceDraft((p) => ({ ...p, price: e.target.value }))}
                    />
                    <button type="button" className="btn ghost" onClick={saveCompanyPrice}>
                      Salva prezzo
                    </button>
                  </div>
                  <div className="table compact customer-price-table">
                    <div className="row header">
                      <div>Cliente</div>
                      <div>Prezzo</div>
                      <div>Azioni</div>
                    </div>
                    {customerPrices.map((r) => (
                      <div className="row" key={r.companyId}>
                        <div>{r.companyName}</div>
                        <div>€ {Number(r.price || 0).toFixed(2)}</div>
                        <div>
                          <button type="button" className="btn ghost small" onClick={() => removeCompanyPrice(r.companyId)}>
                            Rimuovi
                          </button>
                        </div>
                      </div>
                    ))}
                    {!customerPrices.length ? (
                      <div className="row">
                        <div>Nessun prezzo dedicato</div>
                        <div>—</div>
                        <div>—</div>
                      </div>
                    ) : null}
                  </div>
                </div>
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
                    />
                  </label>
                  <label>
                    Prezzo consigliato
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
                    Categorie (multi)
                    <select
                      multiple
                      className={`select ${editValidation.categoryId ? "input-error" : ""}`}
                      value={edit.categoryIds || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                        const allowedSub = new Set(
                          selected.flatMap((id) => (categoryChildrenMap.get(id) || []).map((c) => c.name))
                        );
                        setEdit({
                          ...edit,
                          categoryIds: selected,
                          categoryId: selected[0] || "",
                          subcategories: (edit.subcategories || []).filter((s) => allowedSub.has(s)),
                        });
                        if (editValidation.categoryId) {
                          setEditValidation((prev) => ({ ...prev, categoryId: false }));
                        }
                      }}
                    >
                      {topCategoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {editValidation.categoryId ? (
                      <div className="field-error">Seleziona almeno una categoria</div>
                    ) : null}
                  </label>
                  <label>
                    Sottocategorie (multi)
                    <select
                      multiple
                      className={`select ${editValidation.subcategory ? "input-error" : ""}`}
                      value={edit.subcategories || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                        setEdit({ ...edit, subcategories: selected, subcategory: selected[0] || "" });
                        if (editValidation.subcategory) {
                          setEditValidation((prev) => ({ ...prev, subcategory: false }));
                        }
                      }}
                      disabled={!(edit.categoryIds || []).length}
                    >
                      {editSubcategoryOptions.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {editValidation.subcategory ? (
                      <div className="field-error">Seleziona almeno una sottocategoria</div>
                    ) : null}
                  </label>
                  <label>
                    Brand
                    <select
                      className="select"
                      value={edit.brand}
                      onChange={(e) => setEdit({ ...edit, brand: e.target.value })}
                    >
                      <option value="">Seleziona brand</option>
                      {brands.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                      </select>
                  </label>
                  <label>
                    Aroma
                    <select
                      className="select"
                      value={edit.aroma}
                      onChange={(e) => setEdit({ ...edit, aroma: e.target.value })}
                    >
                      <option value="">Seleziona aroma</option>
                      <option value="TABACCOSI">TABACCOSI</option>
                      <option value="CREMOSI">CREMOSI</option>
                      <option value="FRUTTATI">FRUTTATI</option>
                    </select>
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
                      step="0.01"
                      value={exciseComputed ? (Math.ceil(exciseComputed * 100) / 100).toFixed(2) : ""}
                      disabled
                    />
                  </label>
                  <label>
                    IVA calcolata
                    <input
                      type="number"
                      step="0.000001"
                      value={vatComputed ? vatComputed.toFixed(6) : ""}
                      disabled
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
                            sellAsSingle: checked ? false : edit.sellAsSingle,
                            parentId: edit.parentId,
                          });
                          if (!checked) {
                            setChildLinks(new Set());
                          }
                        }}
                      />
                      <span>Raggruppa varianti</span>
                    </div>
                    <div className="muted">Può essere vendibile e apparire anche come singolo.</div>
                  </label>
                  <label>
                    Venduto anche singolarmente
                    <div className="toggle">
                      <input
                        type="checkbox"
                        checked={edit.sellAsSingle}
                        onChange={(e) => setEdit({ ...edit, sellAsSingle: e.target.checked })}
                        disabled={!edit.parentId}
                      />
                      <span>Mostra come Figlio+singolo</span>
                    </div>
                    <div className="muted">Attivo solo per i prodotti figli.</div>
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
                    >
                      <option value="">Nessuno</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Prodotti correlati
                    {edit.isParent || edit.sellAsSingle ? (
                      <div className="related-box">
                        <div className="related-toolbar">
                          <div className="muted">
                            Selezionati: <strong>{relatedSelected.length}</strong>
                          </div>
                          {relatedSelected.length > 0 ? (
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => setEdit({ ...edit, relatedProductIds: [] })}
                            >
                              Svuota
                            </button>
                          ) : null}
                        </div>
                        <input
                          className="related-search"
                          placeholder="Cerca SKU o nome prodotto..."
                          value={relatedSearch}
                          onChange={(e) => setRelatedSearch(e.target.value)}
                        />
                        {relatedSelected.length > 0 ? (
                          <div className="related-chips">
                            {relatedSelected.slice(0, 8).map((p) => (
                              <span key={p.id} className="related-chip">
                                {p.sku}
                              </span>
                            ))}
                            {relatedSelected.length > 8 ? (
                              <span className="related-chip more">+{relatedSelected.length - 8}</span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="related-picker">
                          {relatedCandidates.length === 0 ? (
                            <div className="muted">Nessun prodotto disponibile</div>
                          ) : (
                            relatedCandidates.map((p) => (
                              <label key={p.id} className="related-item">
                                <input
                                  type="checkbox"
                                  className="related-check"
                                  checked={Boolean((edit.relatedProductIds || []).includes(p.id))}
                                  onChange={(e) => {
                                    const next = new Set(edit.relatedProductIds || []);
                                    if (e.target.checked) next.add(p.id);
                                    else next.delete(p.id);
                                    setEdit({ ...edit, relatedProductIds: Array.from(next) });
                                  }}
                                />
                                {p.imageUrl ? (
                                  <img className="related-thumb" src={withToken(p.imageUrl)} alt={p.name || p.sku} />
                                ) : (
                                  <div className="related-thumb placeholder" />
                                )}
                                <span className="related-text">
                                  <strong>{p.sku}</strong> · {p.name}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                        <div className="muted">
                          Disponibile per prodotti padre e per figli venduti anche singolarmente.
                        </div>
                      </div>
                    ) : (
                      <div className="muted">
                        Abilita "Venduto anche singolarmente" per impostare correlati su un figlio.
                      </div>
                    )}
                  </label>
                  <label>
                    Giacenza
                    <input
                      type="number"
                      step="1"
                      value={edit.stockQty}
                      onChange={(e) => setEdit({ ...edit, stockQty: e.target.value })}
                      disabled={selectedProduct.source === "SUPPLIER" || edit.isUnavailable}
                    />
                    {selectedProduct.source === "SUPPLIER" ? (
                      <div className="muted">La giacenza è sincronizzata dal fornitore</div>
                    ) : null}
                    {edit.isUnavailable ? <div className="muted">Prodotto non disponibile</div> : null}
                  </label>
                  <label>
                    Immagine URL
                    <input value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} />
                  </label>
                </div>
                <label className="full">
                  Breve descrizione
                  <RichTextEditor
                    value={edit.shortDescription}
                    onChange={(next) => setEdit({ ...edit, shortDescription: next })}
                    placeholder="Breve descrizione prodotto..."
                  />
                </label>
                <label>
                  Descrizione
                  <RichTextEditor
                    value={edit.description}
                    onChange={(next) => setEdit({ ...edit, description: next })}
                  />
                </label>
                <div className="actions">
                  {selectedProduct.published === false ? (
                    <button
                      className="btn primary"
                      onClick={() => saveEdit(true)}
                    >
                      Salva e pubblica
                    </button>
                  ) : (
                    <button className="btn primary" onClick={saveEdit}>Salva</button>
                  )}
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

      {showCreateManual ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowCreateManual(false)}>
            <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Crea prodotto manuale</h3>
                <button className="btn ghost" onClick={() => setShowCreateManual(false)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-media" onClick={(e) => e.stopPropagation()}>
                  <div className="cover-wrap">
                    {manualImagePreview ? (
                      <>
                        <img src={manualImagePreview} alt="Preview" />
                        <button
                          type="button"
                          className="cover-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            setManualImageFile(null);
                            setManualImagePreview("");
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
                    className="upload-drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      setManualImageFile(file);
                      setManualImagePreview(URL.createObjectURL(file));
                    }}
                    onClick={() => manualFileInputRef.current?.click()}
                  >
                    <div className="muted">Trascina immagini qui o clicca per caricare</div>
                    <input
                      ref={manualFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setManualImageFile(file);
                        setManualImagePreview(URL.createObjectURL(file));
                      }}
                      style={{ display: "none" }}
                    />
                  </div>
                </div>
                <div className="modal-info">
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        value={manualDraft.name}
                        onChange={(e) => setManualDraft({ ...manualDraft, name: e.target.value })}
                      />
                    </label>
                    <label>
                      SKU
                      <div className="input-row">
                        <input
                          value={manualDraft.sku}
                          onChange={(e) => setManualDraft({ ...manualDraft, sku: e.target.value })}
                        />
                        <button type="button" className="btn ghost" onClick={generateManualSku}>
                          Genera SKU
                        </button>
                      </div>
                    </label>
                    <label>
                      Prezzo vendita
                      <input
                        type="number"
                        step="0.01"
                        value={manualDraft.price}
                        onChange={(e) => setManualDraft({ ...manualDraft, price: e.target.value })}
                      />
                    </label>
                    <label>
                      Giacenza
                      <input
                        type="number"
                        value={manualDraft.stockQty}
                        onChange={(e) => setManualDraft({ ...manualDraft, stockQty: e.target.value })}
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        className="select"
                        value={manualDraft.categoryId}
                        onChange={(e) => setManualDraft({ ...manualDraft, categoryId: e.target.value, subcategory: "" })}
                      >
                        <option value="">Seleziona categoria</option>
                        {topCategoryOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sottocategoria
                      <select
                        className="select"
                        value={manualDraft.subcategory}
                        onChange={(e) => setManualDraft({ ...manualDraft, subcategory: e.target.value })}
                        disabled={!manualDraft.categoryId}
                      >
                        <option value="">
                          {manualDraft.categoryId
                            ? "Seleziona sottocategoria"
                            : "Seleziona prima una categoria"}
                        </option>
                        {manualSubcategoryOptions.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Brand
                      <select
                        className="select"
                        value={manualDraft.brand}
                        onChange={(e) => setManualDraft({ ...manualDraft, brand: e.target.value })}
                      >
                        <option value="">Seleziona brand</option>
                        {brands.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Aroma
                      <select
                        className="select"
                        value={manualDraft.aroma}
                        onChange={(e) => setManualDraft({ ...manualDraft, aroma: e.target.value })}
                      >
                        <option value="">Seleziona aroma</option>
                        <option value="TABACCOSI">TABACCOSI</option>
                        <option value="CREMOSI">CREMOSI</option>
                        <option value="FRUTTATI">FRUTTATI</option>
                      </select>
                    </label>
                    <label>
                      Prezzo acquisto
                      <input
                        type="number"
                        step="0.01"
                        value={manualDraft.purchasePrice}
                        onChange={(e) => setManualDraft({ ...manualDraft, purchasePrice: e.target.value })}
                      />
                    </label>
                    <label>
                      Prezzo consigliato
                      <input
                        type="number"
                        step="0.01"
                        value={manualDraft.listPrice}
                        onChange={(e) => setManualDraft({ ...manualDraft, listPrice: e.target.value })}
                      />
                    </label>
                    <label>
                      Prezzo sconto
                      <input
                        type="number"
                        step="0.01"
                        value={manualDraft.discountPrice}
                        onChange={(e) => setManualDraft({ ...manualDraft, discountPrice: e.target.value })}
                      />
                    </label>
                    <label>
                      Q.tà sconto
                      <input
                        type="number"
                        value={manualDraft.discountQty}
                        onChange={(e) => setManualDraft({ ...manualDraft, discountQty: e.target.value })}
                      />
                    </label>
                    <label>
                      ML Prodotto
                      <input
                        type="number"
                        step="0.001"
                        value={manualDraft.mlProduct}
                        onChange={(e) => setManualDraft({ ...manualDraft, mlProduct: e.target.value })}
                      />
                    </label>
                    <label>
                      Nicotina
                      <input
                        type="number"
                        step="0.001"
                        value={manualDraft.nicotine}
                        onChange={(e) => setManualDraft({ ...manualDraft, nicotine: e.target.value })}
                      />
                    </label>
                    <label>
                      Aliquota IVA
                      <select
                        className="select"
                        value={manualDraft.taxRateId}
                        onChange={(e) => setManualDraft({ ...manualDraft, taxRateId: e.target.value })}
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
                        value={manualDraft.exciseRateId}
                        onChange={(e) => setManualDraft({ ...manualDraft, exciseRateId: e.target.value })}
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
                      Codice a barre
                      <input
                        value={manualDraft.barcode}
                        onChange={(e) => setManualDraft({ ...manualDraft, barcode: e.target.value })}
                      />
                    </label>
                    <label className="full">
                      Breve descrizione
                      <RichTextEditor
                        value={manualDraft.shortDescription}
                        onChange={(next) => setManualDraft({ ...manualDraft, shortDescription: next })}
                        placeholder="Breve descrizione prodotto..."
                      />
                    </label>
                    <label className="full">
                      Descrizione
                      <RichTextEditor
                        value={manualDraft.description}
                        onChange={(next) => setManualDraft({ ...manualDraft, description: next })}
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button className="btn ghost" onClick={() => setShowCreateManual(false)}>
                      Annulla
                    </button>
                    <button className="btn primary" onClick={createManualProduct}>
                      Crea prodotto
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {showImportConfirm && importFile ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowImportConfirm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Conferma import CSV</div>
                  <div className="modal-subtitle">
                    Verranno aggiornati i prodotti che hanno lo stesso SKU.
                  </div>
                </div>
                <button className="btn ghost" onClick={() => setShowImportConfirm(false)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="summary-grid">
                  <div>
                    <strong>File</strong>
                    <div>{importFile.name}</div>
                  </div>
                  <div>
                    <strong>Dimensione</strong>
                    <div>{(importFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowImportConfirm(false)}>
                    Annulla
                  </button>
                  <button className="btn primary" onClick={() => importCsv(importFile)} disabled={importingCsv}>
                    {importingCsv ? "Importazione..." : "Importa"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {importSummary ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setImportSummary(null)}>
            <div className="modal modal-compact" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Import completato</div>
                  <div className="modal-subtitle">Riepilogo aggiornamenti</div>
                </div>
                <button className="btn ghost" onClick={() => setImportSummary(null)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="summary-grid">
                  <div>
                    <strong>Aggiornati</strong>
                    <div>{importSummary.updated ?? 0}</div>
                  </div>
                  <div>
                    <strong>Saltati</strong>
                    <div>{importSummary.skipped ?? 0}</div>
                  </div>
                </div>
                <div className="actions">
                  <button className="btn primary" onClick={() => setImportSummary(null)}>
                    Ok
                  </button>
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
                          <div>Prezzo consigliato</div>
                  <div>Acquisto</div>
                  <div>Sconto</div>
                  <div>Q.tà Sconto</div>
                  <div>Giacenza</div>
                  <div>Nicotina</div>
                  <div>Categoria</div>
                  <div>IVA</div>
                  <div>Accisa</div>
                  <div>Pubblicato</div>
                  <div>Non disp.</div>
                  <div>Padre?</div>
                  <div>Figlio+singolo?</div>
                  <div>Padre</div>
                </div>
                {(() => {
                  const byParent = new Map();
                  const parents = bulkRows.filter((r) => r.isParent);
                  for (const parent of parents) byParent.set(parent.id, []);
                  const singles = [];
                  for (const row of bulkRows) {
                    if (row.isParent) continue;
                    if (row.parentId && byParent.has(row.parentId)) {
                      byParent.get(row.parentId).push(row);
                    } else {
                      singles.push(row);
                    }
                  }
                  const ordered = [];
                  for (const parent of parents) {
                    ordered.push({ type: "parent", row: parent });
                    if (!bulkCollapsedParents.has(parent.id)) {
                      for (const child of byParent.get(parent.id) || []) {
                        ordered.push({ type: "child", row: child, parent });
                      }
                    }
                  }
                  for (const single of singles) ordered.push({ type: "single", row: single });
                  const bulkParentOptions = parents.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
                  return ordered.map(({ row, type, parent }) => {
                    const idx = bulkRows.findIndex((r) => r.id === row.id);
                    const isChild = type === "child";
                    const isParent = type === "parent";
                    const isDraftRow = row.isDraftRow;
                    const moveRow = (draggedId, targetId) => {
                      if (!draggedId || draggedId === targetId) return;
                      const current = [...bulkRows];
                      const fromIndex = current.findIndex((r) => r.id === draggedId);
                      const toIndex = current.findIndex((r) => r.id === targetId);
                      if (fromIndex === -1 || toIndex === -1) return;
                      const [moved] = current.splice(fromIndex, 1);
                      current.splice(toIndex, 0, moved);
                      setBulkRows(current);
                    };
                    return (
                      <div
                        className={`bulk-row ${isChild ? "child-row" : ""} ${isParent ? "parent-row" : ""} ${
                          bulkDragOver === row.id ? "drag-over" : ""
                        } ${isDraftRow ? "draft-row" : ""}`}
                        key={row.id}
                        draggable={!isParent}
                        onDragStart={(e) => {
                          if (isParent) return;
                          e.dataTransfer.setData("text/plain", row.id);
                        }}
                        onDragOver={(e) => {
                          if (!isParent && !isChild) return;
                          e.preventDefault();
                          setBulkDragOver(row.id);
                        }}
                        onDragLeave={() => setBulkDragOver("")}
                        onDrop={(e) => {
                          if (!isParent && !isChild) return;
                          e.preventDefault();
                          const draggedId = e.dataTransfer.getData("text/plain");
                          if (!draggedId || draggedId === row.id) return;
                          if (isParent) {
                            const next = bulkRows.map((r) =>
                              r.id === draggedId ? { ...r, parentId: row.id } : r
                            );
                            setBulkRows(next);
                          } else if (isChild) {
                            const dragged = bulkRows.find((r) => r.id === draggedId);
                            if (dragged?.parentId === row.parentId) {
                              moveRow(draggedId, row.id);
                            }
                          }
                          setBulkDragOver("");
                        }}
                      >
                        <div className="mono">
                          {isParent ? (
                            <button
                              type="button"
                              className="collapse-toggle"
                              onClick={() => {
                                const next = new Set(bulkCollapsedParents);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                setBulkCollapsedParents(next);
                              }}
                            >
                              {bulkCollapsedParents.has(row.id) ? "+" : "−"}
                            </button>
                          ) : null}
                          {row.sku}
                        </div>
                        <input
                          value={row.name}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx] = { ...row, name: e.target.value };
                            setBulkRows(next);
                          }}
                          disabled={!isDraftRow}
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
                          disabled={row.isParent || !isDraftRow}
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
                          disabled={!isDraftRow}
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
                          disabled={!isDraftRow}
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
                          disabled={!isDraftRow}
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
                          disabled={!isDraftRow}
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
                          disabled={row.isParent || !isDraftRow}
                        />
                        <input
                          type="number"
                          step="0.001"
                          value={row.nicotine}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx] = { ...row, nicotine: e.target.value };
                            setBulkRows(next);
                          }}
                          disabled={!isDraftRow}
                        />
                        <select
                          value={row.categoryId}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx] = { ...row, categoryId: e.target.value };
                            setBulkRows(next);
                          }}
                          disabled={!isDraftRow}
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
                          disabled={!isDraftRow}
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
                          disabled={!isDraftRow}
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
                            checked={row.published}
                            onChange={(e) => {
                              const next = [...bulkRows];
                              next[idx] = { ...row, published: e.target.checked };
                              setBulkRows(next);
                            }}
                          disabled={!isDraftRow}
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
                            disabled={!isDraftRow}
                          />
                          <span />
                        </label>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={row.isParent}
                            onChange={(e) => {
                              const next = [...bulkRows];
                              next[idx] = {
                                ...row,
                                isParent: e.target.checked,
                                sellAsSingle: e.target.checked ? false : row.sellAsSingle,
                                parentId: e.target.checked ? "" : row.parentId,
                              };
                              setBulkRows(next);
                            }}
                            disabled={false}
                          />
                          <span />
                        </label>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(row.sellAsSingle)}
                            onChange={(e) => {
                              const next = [...bulkRows];
                              next[idx] = { ...row, sellAsSingle: e.target.checked };
                              setBulkRows(next);
                            }}
                            disabled={row.isParent}
                          />
                          <span />
                        </label>
                        <select
                          value={row.parentId}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx] = { ...row, parentId: e.target.value };
                            setBulkRows(next);
                          }}
                          disabled={row.isParent}
                        >
                          <option value="">Nessun padre</option>
                          {(productFilter === "draft"
                            ? bulkParentOptions.filter((p) => {
                                const row = bulkRows.find((r) => r.id === p.id);
                                return row?.isDraftRow;
                              })
                            : bulkParentOptions
                          ).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  });
                })()}
              </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowBulkEditor(false)}>
                    Annulla
                  </button>
                  {productFilter === "draft" ? (
                    <button className="btn primary" onClick={() => saveBulk(true)} disabled={bulkSaving}>
                      {bulkSaving ? "Salvataggio..." : "Salva e pubblica"}
                    </button>
                  ) : (
                    <button className="btn primary" onClick={saveBulk} disabled={bulkSaving}>
                      {bulkSaving ? "Salvataggio..." : "Salva modifiche"}
                    </button>
                  )}
                </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
