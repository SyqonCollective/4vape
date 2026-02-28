import { useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import trashAnim from "../../assets/Trash clean.json";
import { api, getToken, getAuthToken } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

// CHECKLIST (admin richieste):
// [x] Import CSV giacenza (alias quantità supportati lato API)
// [x] Breve descrizione sopra descrizione con stesso editor rich text
// [x] Scheda prodotto aperta più ampia (quasi full-screen)

function RichTextEditor({ value, onChange, placeholder = "Scrivi la descrizione..." }) {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const EMOJI_LIST = [
    "😀","😂","😍","🥰","😎","🤩","🔥","✨","💯","👍",
    "❤️","💚","💙","💜","🧡","💛","🖤","🤍","💖","💝",
    "🎉","🎊","🏆","⭐","🌟","💎","🎁","🎯","✅","❌",
    "⚡","💧","🌈","🍃","🌿","🌸","🌺","🍀","🫧","💨",
    "🚀","💣","🎶","📢","📌","🔗","📦","🛒","💰","🏷️",
    "👉","👈","👆","👇","☝️","✌️","🤞","🙏","💪","🤝",
    "🍓","🍇","🍊","🍋","🍎","🍑","🫐","🍉","🥝","🍌",
    "☁️","🌙","☀️","🌊","❄️","🔔","💡","🎨","🧪","💊"
  ];

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
    const sel = window.getSelection();
    const selectedNode = sel?.anchorNode?.parentElement;
    const isImage = selectedNode?.tagName === "IMG" || sel?.anchorNode?.tagName === "IMG";
    const defaultUrl = isImage ? "" : "";
    const url = window.prompt("Inserisci URL (https://...)", defaultUrl);
    if (!url) return;
    if (isImage) {
      const img = selectedNode?.tagName === "IMG" ? selectedNode : sel?.anchorNode;
      if (img) {
        const a = document.createElement("a");
        a.href = url.trim();
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        img.parentNode.insertBefore(a, img);
        a.appendChild(img);
        onChange(editorRef.current.innerHTML);
        return;
      }
    }
    run("createLink", url.trim());
  }

  function onInsertImage() {
    const url = window.prompt("Inserisci URL immagine (https://...)");
    if (!url) return;
    run("insertImage", url.trim());
  }

  function onUploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      document.execCommand("insertImage", false, reader.result);
      onChange(el.innerHTML);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function onInsertEmoji(emoji) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertText", false, emoji);
    onChange(el.innerHTML);
    setShowEmojiPicker(false);
  }

  function onHeadingChange(e) {
    const val = e.target.value;
    if (val === "p") {
      run("formatBlock", "<p>");
    } else {
      run("formatBlock", `<${val}>`);
    }
  }

  function onFontSizeChange(e) {
    run("fontSize", e.target.value);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <select className="rte-select" onChange={onHeadingChange} defaultValue="p" title="Formato">
          <option value="p">Paragrafo</option>
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="h4">H4</option>
        </select>
        <select className="rte-select" onChange={onFontSizeChange} defaultValue="3" title="Dimensione">
          <option value="1">Piccolo</option>
          <option value="2">Normale-</option>
          <option value="3">Normale</option>
          <option value="4">Medio</option>
          <option value="5">Grande</option>
          <option value="6">Molto grande</option>
          <option value="7">Enorme</option>
        </select>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={() => run("bold")} title="Grassetto">
          <strong>B</strong>
        </button>
        <button type="button" className="rte-btn" onClick={() => run("italic")} title="Corsivo">
          <em>I</em>
        </button>
        <button type="button" className="rte-btn" onClick={() => run("underline")} title="Sottolineato">
          <u>U</u>
        </button>
        <button type="button" className="rte-btn" onClick={() => run("strikeThrough")} title="Barrato">
          <s>S</s>
        </button>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={() => run("justifyLeft")} title="Allinea a sinistra">
          ≡←
        </button>
        <button type="button" className="rte-btn" onClick={() => run("justifyCenter")} title="Centra">
          ≡↔
        </button>
        <button type="button" className="rte-btn" onClick={() => run("justifyRight")} title="Allinea a destra">
          →≡
        </button>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={() => run("insertUnorderedList")} title="Elenco puntato">
          • List
        </button>
        <button type="button" className="rte-btn" onClick={() => run("insertOrderedList")} title="Elenco numerato">
          1. List
        </button>
        <div className="rte-separator" />
        <button type="button" className="rte-btn" onClick={onAddLink} title="Aggiungi link (o link su immagine selezionata)">
          🔗 Link
        </button>
        <button type="button" className="rte-btn" onClick={onInsertImage} title="Inserisci immagine da URL">
          🖼️ URL
        </button>
        <button type="button" className="rte-btn" onClick={() => fileInputRef.current?.click()} title="Carica immagine">
          📤 Img
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onUploadImage}
        />
        <div className="rte-emoji-wrap">
          <button type="button" className="rte-btn" onClick={() => setShowEmojiPicker((v) => !v)} title="Emoji">
            😊
          </button>
          {showEmojiPicker && (
            <div className="rte-emoji-picker">
              {EMOJI_LIST.map((e) => (
                <button key={e} type="button" className="rte-emoji-item" onClick={() => onInsertEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rte-separator" />
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
        onBlur={() => setShowEmojiPicker(false)}
      />
    </div>
  );
}

function ProductsTanstackTable({ rows, columns, onRowClick }) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="table wide-10 products-tanstack">
      <div className="row header">
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div key={header.id}>
              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          ))
        )}
      </div>
      {table.getRowModel().rows.map((tr) => {
        const original = tr.original;
        const p = original.item;
        return (
          <div
            key={tr.id}
            className={`row clickable ${!original.isParentRow && p.isUnavailable ? "unavailable" : ""} ${
              p.published === false ? "draft" : ""
            } ${original.isChild ? "child-row" : ""} ${original.isParentRow ? "parent-row" : ""}`}
            onClick={() => onRowClick(p)}
          >
            {tr.getVisibleCells().map((cell) => (
              <div key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
            ))}
          </div>
        );
      })}
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
  const [bulkSnapshot, setBulkSnapshot] = useState("");
  const bulkGridRef = useRef(null);
  const [collapsedParents, setCollapsedParents] = useState(new Set());
  const collapsedInitRef = useRef(false);
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
  const [viewMode, setViewMode] = useState("table");
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
      const authToken = await getAuthToken();
      const res = await fetch("/api/admin/products/export", {
        headers: { Authorization: `Bearer ${authToken}` },
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
      const authToken = await getAuthToken();
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
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
    if (collapsedInitRef.current || items.length === 0) return;
    const parentIds = new Set(items.filter((p) => p.isParent).map((p) => p.id));
    if (parentIds.size > 0) {
      setCollapsedParents(parentIds);
      collapsedInitRef.current = true;
    }
  }, [items]);

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
      mlProduct: p.mlProduct ? parseFloat(Number(p.mlProduct).toFixed(3)) : "",
      nicotine: p.nicotine ? parseFloat(Number(p.nicotine).toFixed(3)) : "",
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
          stockQty: edit.isParent ? 0 : edit.stockQty !== "" ? Number(edit.stockQty) : undefined,
          imageUrl: edit.imageUrl || undefined,
          categoryId: edit.categoryId || undefined,
          parentId: edit.parentId || undefined,
          isParent: edit.isParent,
          sellAsSingle: edit.sellAsSingle,
          isUnavailable: edit.isParent ? false : edit.isUnavailable,
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
      const authToken = await getAuthToken();
      const res = await fetch(`/api/admin/products/${selectedProduct.id}/images`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
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
          const authToken = await getAuthToken();
          const res = await fetch(`/api/admin/products/${parent.id}/images`, {
            method: "POST",
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
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
        const authToken = await getAuthToken();
        const res = await fetch(`/api/admin/products/${product.id}/images`, {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
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
    const topLevel = [];
    const baseItems = filteredItems;
    for (const item of baseItems) {
      if (item.isParent) {
        byParent.set(item.id, []);
        topLevel.push(item);
      }
    }
    for (const item of baseItems) {
      if (item.isParent) continue;
      const parentId = item.parentId || item.parent?.id;
      if (parentId && byParent.has(parentId)) {
        byParent.get(parentId).push(item);
      } else {
        topLevel.push(item);
      }
    }
    const sortedTop = sortItems(topLevel);
    const rows = [];
    for (const item of sortedTop) {
      if (item.isParent) {
        rows.push({ type: "parent", item });
        if (!collapsedParents.has(item.id)) {
          const children = (byParent.get(item.id) || []).sort((a, b) => {
            const orderDiff = (a.parentSort ?? 0) - (b.parentSort ?? 0);
            if (orderDiff !== 0) return orderDiff;
            const an = a.name || "";
            const bn = b.name || "";
            return an.localeCompare(bn);
          });
          for (const child of children) {
            rows.push({ type: "child", item: child, parent: item });
          }
        }
      } else {
        rows.push({ type: "single", item });
      }
    }
    return rows;
  })();

  const totalRows = groupedRows.length;
  const effectivePageSize = pageSize === "all" ? totalRows || 1 : Number(pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(totalRows / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * effectivePageSize;
  const pagedRows = groupedRows.slice(pageStart, pageStart + effectivePageSize);

  const tableRows = useMemo(() => {
    if (viewMode !== "table") return [];
    return pagedRows.map((row) => {
      const p = row.item;
      const isChild = row.type === "child";
      const isParentRow = row.type === "parent";
      const isChildSingle = Boolean(p.parentId || p.parent?.id) && Boolean(p.sellAsSingle) && p.price != null;
      const categoriesLabel = Array.isArray(p.categoryIds) && p.categoryIds.length
        ? (p.categoryIds
            .map((id) => topCategoryOptions.find((c) => c.id === id)?.name)
            .filter(Boolean)
            .join(", ") || p.category || "—")
        : (p.category || "—");
      const subcategoriesLabel = Array.isArray(p.subcategories) && p.subcategories.length
        ? p.subcategories.join(", ")
        : (p.subcategory || "");
      return {
        id: p.id,
        item: p,
        rowType: row.type,
        parentSku: row.parent?.sku || p.parent?.sku || "—",
        categoriesLabel,
        subcategoriesLabel,
        isChild,
        isParentRow,
        isChildSingle,
      };
    });
  }, [pagedRows, topCategoryOptions, viewMode]);

  const productTableColumns = useMemo(
    () => [
      {
        id: "image",
        header: "Immagine",
        cell: ({ row }) => {
          const r = row.original;
          const p = r.item;
          return (
            <div className="thumb-cell">
              {r.isParentRow ? (
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
              {p.imageUrl ? <img className="thumb" src={withToken(p.imageUrl)} alt={p.name} /> : <div className="thumb placeholder" />}
            </div>
          );
        },
      },
      {
        id: "sku",
        header: "SKU",
        cell: ({ row }) => {
          const p = row.original.item;
          return bulkMode ? (
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
              <span className="mono">{p.sku}</span>
            </label>
          ) : (
            <span className="mono">{p.sku}</span>
          );
        },
      },
      {
        id: "name",
        header: "Nome",
        cell: ({ row }) => {
          const r = row.original;
          const p = r.item;
          return (
            <div className="name-cell">
              <span>{p.name}</span>
              {r.isParentRow ? <span className="tag parent-tag">PADRE</span> : null}
              {r.isChild ? <span className="tag child-tag">FIGLIO</span> : null}
              {r.isChildSingle ? <span className="tag info">Figlio+singolo</span> : null}
              {!r.isParentRow && p.isUnavailable ? <span className="tag danger">Non disponibile</span> : null}
              {p.published === false ? <span className="tag warn">Draft</span> : null}
            </div>
          );
        },
      },
      { id: "price", header: "Prezzo", cell: ({ row }) => (row.original.isParentRow && row.original.item.price == null ? <span className="cell-muted">—</span> : `€ ${Number(row.original.item.price).toFixed(2)}`) },
      { id: "stock", header: "Giacenza", cell: ({ row }) => (row.original.isParentRow ? <span className="cell-muted">—</span> : row.original.item.stockQty) },
      { id: "type", header: "Prodotto", cell: ({ row }) => (row.original.isParentRow ? "Padre" : row.original.isChildSingle ? "Figlio+singolo" : row.original.item.parentId ? "Figlio" : "Singolo") },
      { id: "parent", header: "Padre", cell: ({ row }) => row.original.parentSku },
      {
        id: "category",
        header: "Categoria",
        cell: ({ row }) => (
          <div>
            <div>{row.original.categoriesLabel}</div>
            {row.original.subcategoriesLabel ? <div className="muted">{row.original.subcategoriesLabel}</div> : null}
          </div>
        ),
      },
      {
        id: "excise",
        header: "Accisa",
        cell: ({ row }) =>
          row.original.item.exciseRateRef?.name ||
          (row.original.item.exciseTotal != null ? `€ ${Number(row.original.item.exciseTotal).toFixed(2)}` : <span className="cell-muted">—</span>),
      },
      { id: "brand", header: "Brand", cell: ({ row }) => row.original.item.brand || <span className="cell-muted">—</span> },
    ],
    [bulkMode, collapsedParents, selectedIds]
  );

  const productsStats = useMemo(() => {
    const visible = filteredItems.length;
    const parentsCount = filteredItems.filter((p) => p.isParent).length;
    const unavailable = filteredItems.filter((p) => !p.isParent && p.isUnavailable).length;
    const lowStock = filteredItems.filter((p) => !p.isParent && Number(p.stockQty || 0) > 0 && Number(p.stockQty || 0) <= 5).length;
    const stockValue = filteredItems.reduce(
      (acc, p) => acc + (p.isParent ? 0 : Number(p.stockQty || 0) * Number(p.purchasePrice || 0)),
      0
    );
    return { visible, parentsCount, unavailable, lowStock, stockValue };
  }, [filteredItems]);
  const byBrand = useMemo(() => {
    const map = new Map();
    for (const p of filteredItems) {
      const key = p.brand || "Senza brand";
      const row = map.get(key) || { name: key, count: 0, stock: 0, value: 0, sample: [] };
      row.count += 1;
      if (!p.isParent) {
        row.stock += Number(p.stockQty || 0);
        row.value += Number(p.stockQty || 0) * Number(p.purchasePrice || 0);
      }
      if (row.sample.length < 4) row.sample.push(p);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredItems]);
  const bulkStats = useMemo(() => {
    const total = bulkRows.length;
    const parents = bulkRows.filter((r) => r.isParent).length;
    const children = bulkRows.filter((r) => !r.isParent && r.parentId).length;
    const singles = bulkRows.filter((r) => !r.isParent && !r.parentId).length;
    const drafts = bulkRows.filter((r) => r.isDraftRow).length;
    const editable = bulkRows.filter((r) => !r.isParent).length;
    return { total, parents, children, singles, drafts, editable };
  }, [bulkRows]);
  const bulkDirty = useMemo(() => (bulkSnapshot ? JSON.stringify(bulkRows) !== bulkSnapshot : false), [bulkRows, bulkSnapshot]);
  const categoryLabelById = useMemo(() => new Map(categoryOptions.map((c) => [c.id, c.label])), [categoryOptions]);
  const taxLabelById = useMemo(
    () => new Map(taxes.map((t) => [t.id, `${t.name} (${Number(t.rate).toFixed(2)}%)`])),
    [taxes]
  );
  const exciseLabelById = useMemo(
    () =>
      new Map(
        excises.map((e) => [e.id, `${e.name} (${Number(e.amount).toFixed(6)}${e.type === "ML" ? "/ml" : ""})`])
      ),
    [excises]
  );
  const bulkParentOptions = useMemo(
    () => bulkRows.filter((r) => r.isParent).map((r) => ({ id: r.id, label: `${r.name} (${r.sku})` })),
    [bulkRows]
  );
  const bulkParentById = useMemo(() => new Map(bulkParentOptions.map((p) => [p.id, p.label])), [bulkParentOptions]);
  const bulkColumnDefs = useMemo(
    () => [
      { field: "sku", headerName: "SKU", minWidth: 130, pinned: "left", editable: false, rowDrag: true, cellClass: "bulk-cell-mono" },
      { field: "name", headerName: "Nome", minWidth: 260, editable: true, pinned: "left" },
      { field: "price", headerName: "Prezzo", minWidth: 120, editable: (p) => !p.data?.isParent, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "listPrice", headerName: "Prezzo cons.", minWidth: 140, editable: true, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "purchasePrice", headerName: "Acquisto", minWidth: 120, editable: true, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "discountPrice", headerName: "Sconto", minWidth: 120, editable: true, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "discountQty", headerName: "Q.tà sconto", minWidth: 120, editable: true, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "stockQty", headerName: "Giacenza", minWidth: 120, editable: (p) => !p.data?.isParent, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      { field: "nicotine", headerName: "Nicotina", minWidth: 120, editable: true, valueParser: (p) => (p.newValue === "" ? "" : Number(p.newValue)) },
      {
        field: "categoryId",
        headerName: "Categoria",
        minWidth: 190,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", ...categoryOptions.map((c) => c.id)] },
        valueFormatter: (p) => (p.value ? categoryLabelById.get(p.value) || p.value : "—"),
      },
      {
        field: "taxRateId",
        headerName: "IVA",
        minWidth: 160,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", ...taxes.map((t) => t.id)] },
        valueFormatter: (p) => (p.value ? taxLabelById.get(p.value) || p.value : "—"),
      },
      {
        field: "exciseRateId",
        headerName: "Accisa",
        minWidth: 180,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["", ...excises.map((e) => e.id)] },
        valueFormatter: (p) => (p.value ? exciseLabelById.get(p.value) || p.value : "—"),
      },
      { field: "published", headerName: "Pubblicato", minWidth: 120, editable: true, cellDataType: "boolean" },
      { field: "isUnavailable", headerName: "Non disp.", minWidth: 120, editable: true, cellDataType: "boolean" },
      { field: "isParent", headerName: "Padre?", minWidth: 100, editable: true, cellDataType: "boolean" },
      { field: "sellAsSingle", headerName: "Figlio+singolo?", minWidth: 140, editable: (p) => !p.data?.isParent, cellDataType: "boolean" },
      {
        field: "parentId",
        headerName: "Padre",
        minWidth: 220,
        editable: (p) => !p.data?.isParent,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: () => ({ values: ["", ...bulkParentOptions.map((p) => p.id)] }),
        valueFormatter: (p) => (p.value ? bulkParentById.get(p.value) || p.value : "Nessun padre"),
      },
    ],
    [bulkParentById, bulkParentOptions, categoryLabelById, categoryOptions, exciseLabelById, excises, taxLabelById, taxes]
  );

  function onBulkCellValueChanged(params) {
    const updated = params.data;
    if (!updated) return;
    setBulkRows((prev) => prev.map((r) => (r.id === updated.id ? { ...updated } : r)));
  }

  function onBulkRowDragEnd(event) {
    const dragged = event.node?.data;
    if (!dragged) return;
    const over = event.overNode?.data;
    const ordered = [];
    event.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) ordered.push({ ...node.data });
    });
    if (!ordered.length) return;
    let next = ordered;
    if (over && over.id !== dragged.id) {
      const draggedIndex = next.findIndex((r) => r.id === dragged.id);
      const overRow = next.find((r) => r.id === over.id);
      if (draggedIndex !== -1 && overRow && !next[draggedIndex].isParent) {
        if (overRow.isParent) {
          next[draggedIndex] = { ...next[draggedIndex], parentId: overRow.id };
        } else {
          next[draggedIndex] = { ...next[draggedIndex], parentId: overRow.parentId || "" };
        }
      }
    }
    const sortCounter = new Map();
    next = next.map((r) => {
      if (!r.parentId) return { ...r, parentSort: 0 };
      const current = sortCounter.get(r.parentId) || 0;
      sortCounter.set(r.parentId, current + 1);
      return { ...r, parentSort: current };
    });
    setBulkRows(next);
  }

  function closeBulkEditor() {
    if (bulkDirty) {
      const ok = window.confirm("Hai modifiche non salvate. Vuoi chiudere e perdere le modifiche?");
      if (!ok) return;
    }
    setShowBulkEditor(false);
  }

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
    setBulkSnapshot(JSON.stringify(rows));
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
      setBulkSnapshot("");
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

      <div className="products-kpi-strip">
        <div className="products-kpi-card">
          <div className="products-kpi-label">Prodotti visibili</div>
          <strong>{productsStats.visible}</strong>
        </div>
        <div className="products-kpi-card">
          <div className="products-kpi-label">Padri</div>
          <strong>{productsStats.parentsCount}</strong>
        </div>
        <div className="products-kpi-card">
          <div className="products-kpi-label">Stock basso (≤5)</div>
          <strong>{productsStats.lowStock}</strong>
        </div>
        <div className="products-kpi-card">
          <div className="products-kpi-label">Non disponibili</div>
          <strong>{productsStats.unavailable}</strong>
        </div>
        <div className="products-kpi-card">
          <div className="products-kpi-label">Valore stock (costo)</div>
          <strong>€ {productsStats.stockValue.toFixed(2)}</strong>
        </div>
      </div>

      <div className="products-view-switch">
        <button
          type="button"
          className={`btn ${viewMode === "table" ? "primary" : "ghost"}`}
          onClick={() => setViewMode("table")}
        >
          Tabella
        </button>
        <button
          type="button"
          className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`}
          onClick={() => setViewMode("cards")}
        >
          Card
        </button>
        <button
          type="button"
          className={`btn ${viewMode === "brands" ? "primary" : "ghost"}`}
          onClick={() => setViewMode("brands")}
        >
          Brand board
        </button>
      </div>

      <div className="panel products-panel">
      {viewMode === "table" ? (
      <ProductsTanstackTable
        rows={tableRows}
        columns={productTableColumns}
        onRowClick={(p) => {
          if (bulkMode) {
            const next = new Set(selectedIds);
            if (next.has(p.id)) next.delete(p.id);
            else next.add(p.id);
            setSelectedIds(next);
            return;
          }
          openEdit(p);
        }}
      />
      ) : null}
      {viewMode === "cards" ? (
        <div className="products-card-grid">
          {pagedRows.map((row) => {
            const p = row.item;
            const typeLabel = p.isParent ? "Padre" : (p.parentId ? "Figlio" : "Singolo");
            return (
              <button key={p.id} type="button" className="product-card" onClick={() => openEdit(p)}>
                <div className="product-card-top">
                  {p.imageUrl ? <img className="product-card-thumb" src={withToken(p.imageUrl)} alt={p.name} /> : <div className="product-card-thumb placeholder" />}
                  <div className="product-card-meta">
                    <div className="mono">{p.sku}</div>
                    <strong>{p.name}</strong>
                    <div className="muted">{p.brand || "Senza brand"}</div>
                  </div>
                </div>
                <div className="product-card-chips">
                  <span className="tag info">{typeLabel}</span>
                  {p.published === false ? <span className="tag warn">Draft</span> : null}
                  {!p.isParent && p.isUnavailable ? <span className="tag danger">Non disponibile</span> : null}
                </div>
                <div className="product-card-stats">
                  <div><span>Prezzo</span><strong>{p.isParent ? "—" : `€ ${Number(p.price || 0).toFixed(2)}`}</strong></div>
                  <div><span>Giacenza</span><strong>{p.isParent ? "—" : Number(p.stockQty || 0)}</strong></div>
                  <div><span>Categoria</span><strong>{p.category || "—"}</strong></div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
      {viewMode === "brands" ? (
        <div className="products-brand-board">
          {byBrand.map((b) => (
            <div key={b.name} className="brand-board-col">
              <div className="brand-board-head">
                <strong>{b.name}</strong>
                <span>{b.count} prodotti</span>
              </div>
              <div className="brand-board-sub">
                <span>Stock: {b.stock}</span>
                <span>Valore: € {b.value.toFixed(2)}</span>
              </div>
              <div className="brand-board-list">
                {b.sample.map((p) => (
                  <button key={p.id} type="button" className="brand-board-item" onClick={() => openEdit(p)}>
                    <span className="mono">{p.sku}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
              <div className="product-modal-head">
                <h3>Scheda prodotto</h3>
                <div className="product-modal-subhead">
                  <span className="mono">{selectedProduct.sku}</span>
                  <span>{selectedProduct.name}</span>
                </div>
              </div>
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
                <div className="product-quick-grid">
                  <div className="product-quick-card">
                    <span>SKU</span>
                    <strong className="mono">{selectedProduct.sku}</strong>
                  </div>
                  <div className="product-quick-card">
                    <span>Fornitore</span>
                    <strong>{selectedProduct.sourceSupplier?.name || (selectedProduct.source === "SUPPLIER" ? "Fornitore" : "Manuale")}</strong>
                  </div>
                  <div className="product-quick-card">
                    <span>Tipo</span>
                    <strong>{selectedProduct.isParent ? "Padre" : selectedProduct.parentId ? "Figlio" : "Singolo"}</strong>
                  </div>
                  <div className="product-quick-card">
                    <span>Figli</span>
                    <strong>{selectedProduct.children?.length || 0}</strong>
                  </div>
                </div>
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
                <div className="section-title">Anagrafica e prezzi</div>
                <div className="form-grid product-form-grid">
                  <label className="full product-name-field">
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
                <div className="section-title">Contenuti</div>
                <label className="full product-desc-field">
                  Descrizione breve
                  <RichTextEditor
                    value={edit.shortDescription}
                    onChange={(next) => setEdit({ ...edit, shortDescription: next })}
                    placeholder="Breve descrizione prodotto..."
                  />
                </label>
                <label className="full product-desc-field">
                  Descrizione estesa
                  <RichTextEditor
                    value={edit.description}
                    onChange={(next) => setEdit({ ...edit, description: next })}
                  />
                </label>
                <div className="actions product-actions-sticky">
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
                <div className="product-modal-head">
                  <h3>Crea prodotto manuale</h3>
                  <div className="product-modal-subhead">
                    <span className="mono">{manualDraft.sku || "SKU in generazione"}</span>
                    <span>{manualDraft.name || "Nuovo prodotto"}</span>
                  </div>
                </div>
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
                  <div className="product-quick-grid">
                    <div className="product-quick-card">
                      <span>Canale</span>
                      <strong>Manuale</strong>
                    </div>
                    <div className="product-quick-card">
                      <span>Categoria</span>
                      <strong>{topCategoryOptions.find((c) => c.id === manualDraft.categoryId)?.name || "Nessuna"}</strong>
                    </div>
                    <div className="product-quick-card">
                      <span>Prezzo vendita</span>
                      <strong>{manualDraft.price ? `€ ${Number(manualDraft.price).toFixed(2)}` : "—"}</strong>
                    </div>
                    <div className="product-quick-card">
                      <span>Giacenza</span>
                      <strong>{manualDraft.stockQty || "0"}</strong>
                    </div>
                  </div>
                  <div className="section-title">Anagrafica e prezzi</div>
                  <div className="form-grid product-form-grid">
                    <label className="full product-name-field">
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
                    <label className="full product-desc-field">
                      Descrizione breve
                      <RichTextEditor
                        value={manualDraft.shortDescription}
                        onChange={(next) => setManualDraft({ ...manualDraft, shortDescription: next })}
                        placeholder="Breve descrizione prodotto..."
                      />
                    </label>
                    <label className="full product-desc-field">
                      Descrizione estesa
                      <RichTextEditor
                        value={manualDraft.description}
                        onChange={(next) => setManualDraft({ ...manualDraft, description: next })}
                      />
                    </label>
                  </div>
                  <div className="actions product-actions-sticky">
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
          <div className="modal-backdrop" onClick={closeBulkEditor}>
            <div className="modal bulk-modal bulk-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="bulk-head">
                  <h3>Modifica in bulk</h3>
                  <div className="bulk-subtitle muted">
                    Editor tabellare avanzato: drag & drop figli, aggiornamento massivo campi e publish rapido.
                  </div>
                </div>
                <button className="btn ghost bulk-close-x" onClick={closeBulkEditor} aria-label="Chiudi">
                  ×
                </button>
              </div>
              <div className="bulk-kpis">
                <div className="bulk-kpi-card">
                  <span>Totale</span>
                  <strong>{bulkStats.total}</strong>
                </div>
                <div className="bulk-kpi-card">
                  <span>Padri</span>
                  <strong>{bulkStats.parents}</strong>
                </div>
                <div className="bulk-kpi-card">
                  <span>Figli</span>
                  <strong>{bulkStats.children}</strong>
                </div>
                <div className="bulk-kpi-card">
                  <span>Singoli</span>
                  <strong>{bulkStats.singles}</strong>
                </div>
                <div className="bulk-kpi-card">
                  <span>Bozze</span>
                  <strong>{bulkStats.drafts}</strong>
                </div>
                <div className="bulk-kpi-card">
                  <span>Campi editabili</span>
                  <strong>{bulkStats.editable}</strong>
                </div>
              </div>
              <div className="bulk-hints">
                <span className="hint-chip">Trascina una riga su un padre per assegnarla</span>
                <span className="hint-chip">Trascina tra figli dello stesso padre per riordinare</span>
                <span className="hint-chip">Le bozze sono evidenziate in arancione</span>
              </div>
              <div className="bulk-table">
                <div className="ag-theme-quartz bulk-ag-grid">
                  <AgGridReact
                    ref={bulkGridRef}
                    rowData={bulkRows}
                    columnDefs={bulkColumnDefs}
                    defaultColDef={{
                      sortable: true,
                      filter: true,
                      resizable: true,
                      editable: true,
                    }}
                    getRowId={(p) => p.data.id}
                    stopEditingWhenCellsLoseFocus
                    rowSelection="multiple"
                    suppressRowClickSelection={false}
                    rowDragManaged
                    animateRows
                    onCellValueChanged={onBulkCellValueChanged}
                    onRowDragEnd={onBulkRowDragEnd}
                    rowClassRules={{
                      "bulk-row-parent": (p) => Boolean(p.data?.isParent),
                      "bulk-row-child": (p) => Boolean(!p.data?.isParent && p.data?.parentId),
                      "bulk-row-draft": (p) => Boolean(p.data?.isDraftRow),
                    }}
                  />
                </div>
              </div>
                <div className="actions bulk-actions-sticky">
                  <button className="btn ghost" onClick={closeBulkEditor}>
                    Annulla
                  </button>
                  {productFilter === "draft" ? (
                    <button className="btn primary bulk-save-btn" onClick={() => saveBulk(true)} disabled={bulkSaving}>
                      {bulkSaving ? "Salvataggio..." : "Salva e pubblica"}
                    </button>
                  ) : (
                    <button className="btn primary bulk-save-btn" onClick={saveBulk} disabled={bulkSaving}>
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
