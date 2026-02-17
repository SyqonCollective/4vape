import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";
const emptyDiscount = {
  name: "",
  code: "",
  active: true,
  scope: "ORDER",
  target: "",
  type: "PERCENT",
  value: "",
  minSpend: "",
  startDate: "",
  endDate: "",
  notes: "",
};
const emptyRule = {
  name: "",
  active: true,
  scope: "ORDER",
  target: "",
  type: "PERCENT",
  value: "",
  maxDiscount: "",
  minQty: "",
  minSpend: "",
  stackable: false,
  priority: 50,
  startDate: "",
  endDate: "",
  days: [],
  timeFrom: "",
  timeTo: "",
  includeSkus: "",
  excludeSkus: "",
  notes: "",
};

const dayOptions = [
  { id: "mon", label: "Lun" },
  { id: "tue", label: "Mar" },
  { id: "wed", label: "Mer" },
  { id: "thu", label: "Gio" },
  { id: "fri", label: "Ven" },
  { id: "sat", label: "Sab" },
  { id: "sun", label: "Dom" },
];

function formatDiscount(rule) {
  const value = rule.value ? Number(rule.value) : 0;
  if (String(rule.type).toUpperCase() === "PERCENT") return `${value.toFixed(2)}%`;
  return `€ ${value.toFixed(2)}`;
}

function buildSummary(rule) {
  const scopeLabel =
    rule.scope === "ORDER"
      ? "Ordine"
      : rule.scope === "CATEGORY"
      ? "Categoria"
      : rule.scope === "BRAND"
      ? "Brand"
      : rule.scope === "SUPPLIER"
      ? "Fornitore"
      : "Prodotto";
  const targets = parseTargetList(rule.target);
  const targetLabel = targets.length > 1 ? `${targets.length} selezionati` : targets[0];
  const target = targetLabel ? ` · ${targetLabel}` : "";
  const minQty = rule.minQty ? `Min ${rule.minQty} pezzi` : "";
  const minSpend = rule.minSpend ? `Min € ${Number(rule.minSpend).toFixed(2)}` : "";
  const limits = [minQty, minSpend].filter(Boolean).join(" | ");
  const dateRange = rule.startDate || rule.endDate ? `${rule.startDate || "—"} → ${rule.endDate || "—"}` : "";
  const timeRange = rule.timeFrom || rule.timeTo ? `${rule.timeFrom || "—"}–${rule.timeTo || "—"}` : "";
  return [
    `${scopeLabel}${target}`,
    `Sconto ${formatDiscount(rule)}`,
    limits,
    dateRange,
    timeRange,
  ]
    .filter(Boolean)
    .join(" · ");
}

function parseTargetList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function scopeLabel(scope) {
  switch (scope) {
    case "ORDER":
      return "Ordine";
    case "PRODUCT":
      return "Prodotti";
    case "CATEGORY":
      return "Categoria";
    case "BRAND":
      return "Brand";
    case "SUPPLIER":
      return "Fornitore";
    case "PARENT":
      return "Prodotti padre";
    default:
      return "—";
  }
}

function TargetPicker({
  scope,
  target,
  onChange,
  products,
  categories,
  loading,
  placeholder,
}) {
  const [query, setQuery] = useState("");
  const values = useMemo(() => parseTargetList(target), [target]);

  const list =
    scope === "CATEGORY"
      ? categories
      : scope === "PARENT"
      ? products.filter((p) => p.isParent)
      : products;
  const filtered = useMemo(() => {
    if (!query.trim()) return list.slice(0, 200);
    const term = query.trim().toLowerCase();
    return list
      .filter((item) =>
        scope === "CATEGORY"
          ? item.name?.toLowerCase().includes(term)
          : `${item.sku} ${item.name}`.toLowerCase().includes(term)
      )
      .slice(0, 200);
  }, [list, query, scope]);

  function toggle(value) {
    const next = new Set(values);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next).join(", "));
  }

  if (scope === "ORDER") {
    return (
      <div className="muted">Nessun target richiesto per l'intero ordine</div>
    );
  }

  if (scope === "PRODUCT" || scope === "CATEGORY" || scope === "PARENT") {
    return (
      <div className="target-picker">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            scope === "CATEGORY"
              ? "Cerca categoria"
              : scope === "PARENT"
              ? "Cerca prodotto padre"
              : "Cerca prodotto per SKU o nome"
          }
        />
        {loading ? <div className="muted">Caricamento elenco...</div> : null}
        <div className="target-list">
          {filtered.map((item) => {
            const id = scope === "CATEGORY" || scope === "PARENT" ? item.id : item.sku;
            const label =
              scope === "CATEGORY"
                ? item.name
                : scope === "PARENT"
                ? `${item.sku} · ${item.name}`
                : `${item.sku} · ${item.name}`;
            const active = values.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={`target-row ${active ? "active" : ""}`}
                onClick={() => toggle(id)}
              >
                <span className={`target-check ${active ? "active" : ""}`}>{active ? "✓" : ""}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <div className="target-meta">
          {values.length ? `${values.length} selezionati` : placeholder}
        </div>
      </div>
    );
  }

  return (
    <input
      value={target}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export default function AdminDiscountRules() {
  const [rules, setRules] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [draft, setDraft] = useState(emptyRule);
  const [discountDraft, setDiscountDraft] = useState(emptyDiscount);
  const [editingId, setEditingId] = useState("");
  const [editingDiscountId, setEditingDiscountId] = useState("");
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openDiscounts, setOpenDiscounts] = useState(true);
  const [openRules, setOpenRules] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true);
      setError("");
      try {
        const [ruleRes, discountRes] = await Promise.all([
          api("/admin/rules"),
          api("/admin/discounts"),
        ]);
        if (!active) return;
        const normalizeType = (item) => ({
          ...item,
          type: item?.type ? String(item.type).toUpperCase() : item.type,
        });
        setRules((ruleRes || []).map(normalizeType));
        setDiscounts((discountRes || []).map(normalizeType));
      } catch {
        setError("Impossibile caricare sconti e regole");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadAll();
    return () => {
      active = false;
    };
  }, []);

  async function ensureOptions() {
    if (optionsLoaded || optionsLoading) return;
    setOptionsLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api("/admin/products"),
        api("/admin/categories"),
      ]);
      setProductOptions(productsRes || []);
      setCategoryOptions(categoriesRes || []);
      setOptionsLoaded(true);
    } catch {
      setError("Impossibile caricare elenco prodotti/categorie");
    } finally {
      setOptionsLoading(false);
    }
  }

  function handleScopeChange(value, setter) {
    if (value === "PRODUCT" || value === "CATEGORY" || value === "PARENT") {
      ensureOptions();
    }
    setter(value);
  }

  function resetDraft() {
    setDraft(emptyRule);
    setEditingId("");
  }

  function resetDiscountDraft() {
    setDiscountDraft(emptyDiscount);
    setEditingDiscountId("");
  }

  async function onSave(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    if ((draft.scope === "PRODUCT" || draft.scope === "CATEGORY" || draft.scope === "PARENT") && !draft.target) {
      setError("Seleziona almeno un target per la regola.");
      return;
    }
    const ruleId =
      editingId || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const payload = {
      ...draft,
      id: ruleId,
      scope: draft.scope || "ORDER",
      value: draft.value ? Number(draft.value) : 0,
      maxDiscount: draft.maxDiscount ? Number(draft.maxDiscount) : 0,
      minQty: draft.minQty ? Number(draft.minQty) : 0,
      minSpend: draft.minSpend ? Number(draft.minSpend) : 0,
      priority: Number(draft.priority || 0),
    };
    try {
      if (editingId) {
        await api(`/admin/rules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/admin/rules", { method: "POST", body: JSON.stringify(payload) });
      }
      const res = await api("/admin/rules");
      setRules(res || []);
      setShowAdvanced(false);
      resetDraft();
      setShowRuleForm(false);
    } catch {
      setError("Errore salvataggio regola");
    }
  }

  function onEdit(rule) {
    setEditingId(rule.id);
    setShowRuleForm(true);
    if (rule.scope === "PRODUCT" || rule.scope === "CATEGORY") {
      ensureOptions();
    }
    setDraft({
      ...rule,
      value: rule.value?.toString() || "",
      maxDiscount: rule.maxDiscount?.toString() || "",
      minQty: rule.minQty?.toString() || "",
      minSpend: rule.minSpend?.toString() || "",
      priority: rule.priority ?? 50,
    });
  }

  async function onDelete(id) {
    if (!confirm("Eliminare questa regola?")) return;
    try {
      await api(`/admin/rules/${id}`, { method: "DELETE" });
      const res = await api("/admin/rules");
      setRules(res || []);
      if (editingId === id) resetDraft();
    } catch {
      setError("Errore eliminazione regola");
    }
  }

  async function onSaveDiscount(e) {
    e.preventDefault();
    if (!discountDraft.name.trim()) return;
    if ((discountDraft.scope === "PRODUCT" || discountDraft.scope === "CATEGORY" || discountDraft.scope === "PARENT") && !discountDraft.target) {
      setError("Seleziona almeno un target per lo sconto.");
      return;
    }
    const discountId =
      editingDiscountId || (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const payload = {
      ...discountDraft,
      id: discountId,
      code: discountDraft.code?.trim() || undefined,
      scope: discountDraft.scope || "ORDER",
      value: discountDraft.value ? Number(discountDraft.value) : 0,
      minSpend: discountDraft.minSpend ? Number(discountDraft.minSpend) : undefined,
    };
    try {
      if (editingDiscountId) {
        await api(`/admin/discounts/${editingDiscountId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/admin/discounts", { method: "POST", body: JSON.stringify(payload) });
      }
      const res = await api("/admin/discounts");
      setDiscounts(res || []);
      resetDiscountDraft();
      setShowDiscountForm(false);
    } catch {
      setError("Errore salvataggio sconto");
    }
  }

  function onEditDiscount(rule) {
    setEditingDiscountId(rule.id);
    setShowDiscountForm(true);
    if (rule.scope === "PRODUCT" || rule.scope === "CATEGORY") {
      ensureOptions();
    }
    setDiscountDraft({
      ...rule,
      value: rule.value?.toString() || "",
      minSpend: rule.minSpend?.toString() || "",
      code: rule.code || "",
    });
  }

  async function onDeleteDiscount(id) {
    if (!confirm("Eliminare questo sconto?")) return;
    try {
      await api(`/admin/discounts/${id}`, { method: "DELETE" });
      const res = await api("/admin/discounts");
      setDiscounts(res || []);
      if (editingDiscountId === id) resetDiscountDraft();
    } catch {
      setError("Errore eliminazione sconto");
    }
  }

  const summary = useMemo(() => buildSummary(draft), [draft]);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Sconti e Regole</h1>
          <p>Configura sconti in € o %, condizioni, priorità e periodi di validità</p>
        </div>
      </div>
      <InlineError message={error} onClose={() => setError("")} />

      <div className="rules-layout">
        <div className="rules-card">
          <div className="rules-list">
            <div className="rules-list-header">
              <div>
                <h2>Sconti attivi</h2>
                <div className="muted">{discounts.length} sconti configurati</div>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setOpenDiscounts((v) => !v)}>
                  {openDiscounts ? "Nascondi" : "Mostra"}
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    resetDiscountDraft();
                    ensureOptions();
                    setShowDiscountForm(true);
                  }}
                >
                  Crea nuovo sconto
                </button>
              </div>
            </div>
            {openDiscounts ? <div className="rules-table">
                <div className="row header">
                  <div>Nome</div>
                  <div>Ambito</div>
                  <div>Valore</div>
                  <div>Validità</div>
                  <div>Azioni</div>
                </div>
              {discounts.map((r) => (
                <div className="row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    {!r.active ? <span className="tag warn">Disattivo</span> : null}
                  </div>
                  <div>{scopeLabel(r.scope || "ORDER")}</div>
                  <div>{formatDiscount(r)}</div>
                  <div>{r.startDate || "—"} → {r.endDate || "—"}</div>
                  <div className="actions">
                    <button className="btn ghost small" onClick={() => onEditDiscount(r)}>
                      Modifica
                    </button>
                    <button className="btn danger small" onClick={() => onDeleteDiscount(r.id)}>
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div> : null}
          </div>

          {showDiscountForm ? (
            <Portal>
              <div className="modal-backdrop" onClick={() => setShowDiscountForm(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{editingDiscountId ? "Modifica sconto" : "Nuovo sconto"}</h3>
                    <button className="btn ghost" onClick={() => setShowDiscountForm(false)}>
                      Chiudi
                    </button>
                  </div>
              <div className="modal-body modal-body-single">
                    <form onSubmit={onSaveDiscount} className="rules-form">
                      <div className="rules-header">
                        <div>
                          <div className="muted">Sconto semplice in € o %</div>
                        </div>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={discountDraft.active}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, active: e.target.checked })}
                          />
                          <span>Attivo</span>
                        </label>
                      </div>
                      <div className="rules-grid rules-grid-compact">
                        <label className="full">
                          Nome sconto
                          <input
                            value={discountDraft.name}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, name: e.target.value })}
                            placeholder="Es. Sconto vetrina 5%"
                          />
                        </label>
                        <label>
                          Codice sconto
                          <input
                            value={discountDraft.code}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, code: e.target.value.toUpperCase() })}
                            placeholder="Es. WELCOME10"
                          />
                        </label>
                        <label>
                          Ambito
                          <select
                            className="select"
                            value={discountDraft.scope}
                            onChange={(e) =>
                              handleScopeChange(e.target.value, (scope) =>
                                setDiscountDraft({ ...discountDraft, scope })
                              )
                            }
                          >
                            <option value="ORDER">Ordine</option>
                            <option value="PRODUCT">Prodotti selezionati</option>
                            <option value="PARENT">Prodotti padre</option>
                            <option value="CATEGORY">Categoria</option>
                          </select>
                        </label>
                        <label className="full">
                          Target
                          <TargetPicker
                            scope={discountDraft.scope}
                            target={discountDraft.target}
                            onChange={(value) => setDiscountDraft({ ...discountDraft, target: value })}
                            products={productOptions}
                            categories={categoryOptions}
                            loading={optionsLoading}
                            placeholder="Seleziona target"
                          />
                        </label>
                        <label>
                          Tipo sconto
                          <select
                            className="select"
                            value={discountDraft.type}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, type: e.target.value })}
                          >
                            <option value="PERCENT">Percentuale</option>
                            <option value="FIXED">Valore fisso (€)</option>
                          </select>
                        </label>
                        <label>
                          Valore
                          <input
                            type="number"
                            step="0.01"
                            value={discountDraft.value}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, value: e.target.value })}
                          />
                        </label>
                        <label>
                          Ordine minimo (€)
                          <input
                            type="number"
                            step="0.01"
                            value={discountDraft.minSpend}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, minSpend: e.target.value })}
                            placeholder="0.00"
                          />
                        </label>
                        <label>
                          Dal
                          <input
                            type="date"
                            value={discountDraft.startDate}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, startDate: e.target.value })}
                          />
                        </label>
                        <label>
                          Al
                          <input
                            type="date"
                            value={discountDraft.endDate}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, endDate: e.target.value })}
                          />
                        </label>
                        <label className="full">
                          Note interne
                          <textarea
                            rows={3}
                            value={discountDraft.notes}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, notes: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="actions">
                        <button type="button" className="btn ghost" onClick={resetDiscountDraft}>
                          Reset
                        </button>
                        <button className="btn primary" type="submit">
                          {editingDiscountId ? "Salva modifica" : "Crea sconto"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </Portal>
          ) : null}
        </div>

        <div className="rules-card">
          <div className="rules-list">
            <div className="rules-list-header">
              <div>
                <h2>Regole attive</h2>
                <div className="muted">{rules.length} regole configurate</div>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setOpenRules((v) => !v)}>
                  {openRules ? "Nascondi" : "Mostra"}
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    resetDraft();
                    ensureOptions();
                    setShowRuleForm(true);
                  }}
                >
                  Crea nuova regola
                </button>
              </div>
            </div>
            {openRules ? <div className="rules-table">
              <div className="row header">
                <div>Nome</div>
                <div>Ambito</div>
                <div>Sconto</div>
                <div>Validità</div>
                <div>Priorità</div>
                <div>Azioni</div>
              </div>
              {rules.map((r) => (
                <div className="row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    {!r.active ? <span className="tag warn">Disattiva</span> : null}
                  </div>
                  <div>{scopeLabel(r.scope)}</div>
                  <div>{formatDiscount(r)}</div>
                  <div>{r.startDate || "—"} → {r.endDate || "—"}</div>
                  <div>{r.priority}</div>
                  <div className="actions">
                    <button className="btn ghost small" onClick={() => onEdit(r)}>
                      Modifica
                    </button>
                    <button className="btn danger small" onClick={() => onDelete(r.id)}>
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div> : null}
          </div>

          {showRuleForm ? (
            <Portal>
              <div className="modal-backdrop" onClick={() => setShowRuleForm(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{editingId ? "Modifica regola" : "Nuova regola"}</h3>
                    <button className="btn ghost" onClick={() => setShowRuleForm(false)}>
                      Chiudi
                    </button>
                  </div>
              <div className="modal-body modal-body-single">
                    <form onSubmit={onSave} className="rules-form">
                      <div className="rules-header">
                        <div>
                          <div className="muted">Condizioni avanzate (qty, spesa, periodi)</div>
                        </div>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                          />
                          <span>Attiva</span>
                        </label>
                      </div>

                      <div className="rules-grid rules-grid-compact">
                        <label className="full">
                          Nome regola
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Es. Promo Vaporizzatori 10+"
                          />
                        </label>

                        <label>
                          Ambito
                          <select
                            className="select"
                            value={draft.scope}
                            onChange={(e) =>
                              handleScopeChange(e.target.value, (scope) => setDraft({ ...draft, scope }))
                            }
                          >
                            <option value="ORDER">Ordine</option>
                            <option value="PRODUCT">Prodotti selezionati</option>
                            <option value="PARENT">Prodotti padre</option>
                            <option value="CATEGORY">Categoria</option>
                            <option value="BRAND">Brand</option>
                            <option value="SUPPLIER">Fornitore</option>
                          </select>
                        </label>
                        <label className="full">
                          Target
                          <TargetPicker
                            scope={draft.scope}
                            target={draft.target}
                            onChange={(value) => setDraft({ ...draft, target: value })}
                            products={productOptions}
                            categories={categoryOptions}
                            loading={optionsLoading}
                            placeholder="SKU, nome brand, categoria..."
                          />
                        </label>

                        <label>
                          Tipo sconto
                          <select
                            className="select"
                            value={draft.type}
                            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                          >
                            <option value="PERCENT">Percentuale</option>
                            <option value="FIXED">Valore fisso (€)</option>
                          </select>
                        </label>
                        <label>
                          Valore
                          <input
                            type="number"
                            step="0.01"
                            value={draft.value}
                            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                          />
                        </label>
                        <label>
                          Minimo pezzi
                          <input
                            type="number"
                            value={draft.minQty}
                            onChange={(e) => setDraft({ ...draft, minQty: e.target.value })}
                          />
                        </label>
                        <label>
                          Minimo spesa (€)
                          <input
                            type="number"
                            step="0.01"
                            value={draft.minSpend}
                            onChange={(e) => setDraft({ ...draft, minSpend: e.target.value })}
                          />
                        </label>

                        <label>
                          Priorità (0-100)
                          <input
                            type="number"
                            value={draft.priority}
                            onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                          />
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={draft.stackable}
                            onChange={(e) => setDraft({ ...draft, stackable: e.target.checked })}
                          />
                          <span>Compatibile con altri sconti</span>
                        </label>

                        <label>
                          Dal
                          <input
                            type="date"
                            value={draft.startDate}
                            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                          />
                        </label>
                        <label>
                          Al
                          <input
                            type="date"
                            value={draft.endDate}
                            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => {
                          if (!showAdvanced) ensureOptions();
                          setShowAdvanced((prev) => !prev);
                        }}
                      >
                        {showAdvanced ? "Nascondi avanzate" : "Mostra avanzate"}
                      </button>

                      {showAdvanced ? (
                        <div className="rules-grid rules-advanced">
                          <label>
                            Sconto massimo (€)
                            <input
                              type="number"
                              step="0.01"
                              value={draft.maxDiscount}
                              onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })}
                            />
                          </label>
                          <label>
                            Orario da
                            <input
                              type="time"
                              value={draft.timeFrom}
                              onChange={(e) => setDraft({ ...draft, timeFrom: e.target.value })}
                            />
                          </label>
                          <label>
                            Orario a
                            <input
                              type="time"
                              value={draft.timeTo}
                              onChange={(e) => setDraft({ ...draft, timeTo: e.target.value })}
                            />
                          </label>

                          <div className="full">
                            <div className="muted">Giorni validità</div>
                            <div className="day-picker">
                              {dayOptions.map((d) => (
                                <button
                                  type="button"
                                  key={d.id}
                                  className={`day-pill ${draft.days.includes(d.id) ? "active" : ""}`}
                                  onClick={() => {
                                    const next = new Set(draft.days);
                                    if (next.has(d.id)) next.delete(d.id);
                                    else next.add(d.id);
                                    setDraft({ ...draft, days: Array.from(next) });
                                  }}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <label className="full">
                            SKU inclusi (separati da virgola)
                            <input
                              value={draft.includeSkus}
                              onChange={(e) => setDraft({ ...draft, includeSkus: e.target.value })}
                              placeholder="SKU1, SKU2, SKU3"
                            />
                          </label>
                          <label className="full">
                            SKU esclusi (separati da virgola)
                            <input
                              value={draft.excludeSkus}
                              onChange={(e) => setDraft({ ...draft, excludeSkus: e.target.value })}
                              placeholder="SKU4, SKU5"
                            />
                          </label>
                          <label className="full">
                            Note interne
                            <textarea
                              rows={3}
                              value={draft.notes}
                              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            />
                          </label>
                        </div>
                      ) : null}

                      <div className="rules-preview">
                        <div className="muted">Anteprima regola</div>
                        <strong>{summary || "Compila i campi per vedere l’anteprima"}</strong>
                      </div>

                      <div className="actions">
                        <button type="button" className="btn ghost" onClick={resetDraft}>
                          Reset
                        </button>
                        <button className="btn primary" type="submit">
                          {editingId ? "Salva modifica" : "Crea regola"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </Portal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
