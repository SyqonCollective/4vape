import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";
const emptyDiscount = {
  name: "",
  active: true,
  type: "percent",
  value: "",
  startDate: "",
  endDate: "",
  notes: "",
};
const emptyRule = {
  name: "",
  active: true,
  scope: "order",
  target: "",
  type: "percent",
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
  if (rule.type === "percent") return `${value.toFixed(2)}%`;
  return `€ ${value.toFixed(2)}`;
}

function buildSummary(rule) {
  const scopeLabel =
    rule.scope === "order"
      ? "Ordine"
      : rule.scope === "category"
      ? "Categoria"
      : rule.scope === "brand"
      ? "Brand"
      : rule.scope === "supplier"
      ? "Fornitore"
      : "Prodotto";
  const target = rule.target ? ` · ${rule.target}` : "";
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
        setRules(ruleRes || []);
        setDiscounts(discountRes || []);
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
    const payload = {
      ...draft,
      id: editingId || crypto.randomUUID(),
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
      resetDraft();
      setShowRuleForm(false);
    } catch {
      setError("Errore salvataggio regola");
    }
  }

  function onEdit(rule) {
    setEditingId(rule.id);
    setShowRuleForm(true);
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
    const payload = {
      ...discountDraft,
      id: editingDiscountId || crypto.randomUUID(),
      value: discountDraft.value ? Number(discountDraft.value) : 0,
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
    setDiscountDraft({
      ...rule,
      value: rule.value?.toString() || "",
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
              <button
                className="btn primary"
                onClick={() => {
                  resetDiscountDraft();
                  setShowDiscountForm(true);
                }}
              >
                Crea nuovo sconto
              </button>
            </div>
            <div className="rules-table">
              <div className="row header">
                <div>Nome</div>
                <div>Tipo</div>
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
                  <div>{r.type === "percent" ? "%" : "€"}</div>
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
            </div>
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
                  <div className="modal-body">
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
                      <div className="rules-grid">
                        <label className="full">
                          Nome sconto
                          <input
                            value={discountDraft.name}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, name: e.target.value })}
                            placeholder="Es. Sconto vetrina 5%"
                          />
                        </label>
                        <label>
                          Tipo sconto
                          <select
                            className="select"
                            value={discountDraft.type}
                            onChange={(e) => setDiscountDraft({ ...discountDraft, type: e.target.value })}
                          >
                            <option value="percent">Percentuale</option>
                            <option value="fixed">Valore fisso (€)</option>
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
              <button
                className="btn primary"
                onClick={() => {
                  resetDraft();
                  setShowRuleForm(true);
                }}
              >
                Crea nuova regola
              </button>
            </div>
            <div className="rules-table">
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
                  <div>{r.scope}</div>
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
            </div>
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
                  <div className="modal-body">
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

                      <div className="rules-grid">
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
                            onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                          >
                            <option value="order">Ordine</option>
                            <option value="product">Prodotto specifico</option>
                            <option value="category">Categoria</option>
                            <option value="brand">Brand</option>
                            <option value="supplier">Fornitore</option>
                          </select>
                        </label>
                        <label>
                          Target
                          <input
                            value={draft.target}
                            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
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
                            <option value="percent">Percentuale</option>
                            <option value="fixed">Valore fisso (€)</option>
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
                          Sconto massimo (€)
                          <input
                            type="number"
                            step="0.01"
                            value={draft.maxDiscount}
                            onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })}
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
