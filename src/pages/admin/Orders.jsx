import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Bozza" },
  { value: "SUBMITTED", label: "In attesa" },
  { value: "APPROVED", label: "Pagato" },
  { value: "FULFILLED", label: "Evaso" },
  { value: "CANCELLED", label: "Annullato" },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    Number(value || 0)
  );

export default function AdminOrders() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [summaryOrder, setSummaryOrder] = useState(null);
  const [companyId, setCompanyId] = useState("");
  const [orderStatus, setOrderStatus] = useState("SUBMITTED");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editStatus, setEditStatus] = useState("SUBMITTED");
  const [editLineItems, setEditLineItems] = useState([]);
  const [editSearchQuery, setEditSearchQuery] = useState("");
  const [editSearchResults, setEditSearchResults] = useState([]);

  async function loadOrders() {
    try {
      const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const res = await api(`/admin/orders${query}`);
      setItems(res);
    } catch (err) {
      setError("Impossibile caricare ordini");
    }
  }

  async function loadCompanies() {
    try {
      const res = await api("/admin/companies");
      setCompanies(res);
      if (!companyId && res.length) setCompanyId(res[0].id);
    } catch (err) {
      setError("Impossibile caricare aziende");
    }
  }

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  useEffect(() => {
    if (showCreate) loadCompanies();
  }, [showCreate]);

  useEffect(() => {
    if (editingOrder) {
      loadCompanies();
      setEditCompanyId(editingOrder.companyId || "");
      setEditStatus(editingOrder.status || "SUBMITTED");
      setEditLineItems(
        (editingOrder.items || []).map((i) => ({
          productId: i.productId,
          sku: i.sku,
          name: i.name,
          unitPrice: Number(i.unitPrice || 0),
          qty: Number(i.qty || 1),
          taxRate: Number(i.product?.taxRate || i.product?.taxRateRef?.rate || 0),
          exciseTotal: i.product?.exciseTotal,
          exciseMl: i.product?.exciseMl,
          exciseProduct: i.product?.exciseProduct,
        }))
      );
      setEditSearchQuery("");
      setEditSearchResults([]);
    }
  }, [editingOrder]);

  useEffect(() => {
    let active = true;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api(
          `/admin/products?q=${encodeURIComponent(searchQuery.trim())}&limit=20&orderBy=name-asc`
        );
        if (active) setSearchResults(res);
      } catch (err) {
        if (active) setSearchResults([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    if (!editSearchQuery.trim()) {
      setEditSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api(
          `/admin/products?q=${encodeURIComponent(editSearchQuery.trim())}&limit=20&orderBy=name-asc`
        );
        if (active) setEditSearchResults(res);
      } catch (err) {
        if (active) setEditSearchResults([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [editSearchQuery]);

  const totals = useMemo(() => {
    const base = lineItems.reduce(
      (sum, item) => {
        const lineTotal = Number(item.unitPrice || 0) * Number(item.qty || 0);
        const rate = Number(item.taxRate || 0);
        const vat = rate > 0 ? lineTotal * (rate / 100) : 0;
        const exciseUnit = Number(
          item.exciseTotal ?? (Number(item.exciseMl || 0) + Number(item.exciseProduct || 0))
        );
        const excise = exciseUnit * Number(item.qty || 0);
        return {
          subtotal: sum.subtotal + lineTotal,
          vat: sum.vat + vat,
          excise: sum.excise + excise,
        };
      },
      { subtotal: 0, vat: 0, excise: 0 }
    );
    return { ...base, total: base.subtotal + base.vat + base.excise };
  }, [lineItems]);

  const editTotals = useMemo(() => {
    const base = editLineItems.reduce(
      (sum, item) => {
        const lineTotal = Number(item.unitPrice || 0) * Number(item.qty || 0);
        const rate = Number(item.taxRate || 0);
        const vat = rate > 0 ? lineTotal * (rate / 100) : 0;
        const exciseUnit = Number(
          item.exciseTotal ?? (Number(item.exciseMl || 0) + Number(item.exciseProduct || 0))
        );
        const excise = exciseUnit * Number(item.qty || 0);
        return {
          subtotal: sum.subtotal + lineTotal,
          vat: sum.vat + vat,
          excise: sum.excise + excise,
        };
      },
      { subtotal: 0, vat: 0, excise: 0 }
    );
    return { ...base, total: base.subtotal + base.vat + base.excise };
  }, [editLineItems]);

  function addItem(product) {
    setLineItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice: Number(product.price || 0),
          qty: 1,
          taxRate: Number(product.taxRate || product.taxRateRef?.rate || 0),
          exciseTotal: product.exciseTotal,
          exciseMl: product.exciseMl,
          exciseProduct: product.exciseProduct,
        },
      ];
    });
  }

  function updateItem(id, patch) {
    setLineItems((prev) =>
      prev.map((i) => (i.productId === id ? { ...i, ...patch } : i))
    );
  }

  function removeItem(id) {
    setLineItems((prev) => prev.filter((i) => i.productId !== id));
  }

  function addEditItem(product) {
    setEditLineItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitPrice: Number(product.price || 0),
          qty: 1,
          taxRate: Number(product.taxRate || product.taxRateRef?.rate || 0),
          exciseTotal: product.exciseTotal,
          exciseMl: product.exciseMl,
          exciseProduct: product.exciseProduct,
        },
      ];
    });
  }

  function updateEditItem(id, patch) {
    setEditLineItems((prev) =>
      prev.map((i) => (i.productId === id ? { ...i, ...patch } : i))
    );
  }

  function removeEditItem(id) {
    setEditLineItems((prev) => prev.filter((i) => i.productId !== id));
  }

  async function createOrder() {
    if (!companyId || !lineItems.length) {
      setError("Seleziona un'azienda e aggiungi almeno un prodotto");
      return;
    }
    setSaving(true);
    try {
      await api("/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          status: orderStatus,
          items: lineItems.map((i) => ({
            productId: i.productId,
            qty: Number(i.qty || 1),
            unitPrice: Number(i.unitPrice || 0),
          })),
        }),
      });
      setShowCreate(false);
      setLineItems([]);
      setSearchQuery("");
      await loadOrders();
    } catch (err) {
      setError("Impossibile creare ordine");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(orderId, status) {
    try {
      await api(`/admin/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOrders();
    } catch (err) {
      setError("Impossibile aggiornare lo stato");
    }
  }

  async function saveEdit() {
    if (!editingOrder) return;
    setSaving(true);
    try {
      await api(`/admin/orders/${editingOrder.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          companyId: editCompanyId,
          status: editStatus,
          items: editLineItems.map((i) => ({
            productId: i.productId,
            qty: Number(i.qty || 1),
            unitPrice: Number(i.unitPrice || 0),
          })),
        }),
      });
      setEditingOrder(null);
      await loadOrders();
    } catch (err) {
      setError("Impossibile salvare ordine");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    if (!editingOrder) return;
    const ok = window.confirm("Vuoi eliminare questo ordine?");
    if (!ok) return;
    setSaving(true);
    try {
      await api(`/admin/orders/${editingOrder.id}`, { method: "DELETE" });
      setEditingOrder(null);
      await loadOrders();
    } catch (err) {
      setError("Impossibile eliminare ordine");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Ordini</h1>
          <p>Gestione ordini B2B</p>
        </div>
        <div className="page-actions">
          <button className="primary order-cta" onClick={() => setShowCreate(true)}>
            Crea ordine manuale
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="filters-row">
        <div className="filter-group">
          <label>Stato</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Tutti</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="orders-table">
        <div className="row header">
          <div>ID</div>
          <div>Azienda</div>
          <div>Stato</div>
          <div>Totale</div>
          <div>Creato</div>
          <div></div>
        </div>
        {items.map((o) => (
          <div className="row" key={o.id} onClick={() => setSummaryOrder(o)}>
            <div className="mono">{o.id.slice(0, 8)}</div>
            <div>{o.company?.name || "-"}</div>
            <div>{STATUS_OPTIONS.find((s) => s.value === o.status)?.label || o.status}</div>
            <div>{formatCurrency(o.total)}</div>
            <div>{new Date(o.createdAt).toLocaleString()}</div>
            <div>
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingOrder(o);
                }}
              >
                Modifica
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
            <div className="modal order-modal shopify-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Crea ordine manuale</div>
                <div className="modal-subtitle">Compila i dettagli e aggiungi i prodotti</div>
              </div>
              <button className="btn ghost" onClick={() => setShowCreate(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body">
              <div className="order-layout">
                <div className="order-left">
                  <div className="order-card">
                    <div className="card-title">Dettagli ordine</div>
                <div className="order-form">
                  <div className="field">
                    <label>Azienda</label>
                    <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Stato ordine</label>
                    <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                      {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="order-card">
                    <div className="card-title">Righe ordine</div>
                    <div className="order-lines">
                      <div className="order-lines-header">
                        <div>Prodotto</div>
                        <div>Prezzo</div>
                        <div>Qta</div>
                        <div>Totale</div>
                        <div></div>
                      </div>
                      {lineItems.map((item) => (
                        <div className="order-line" key={item.productId}>
                          <div>
                            <div className="line-title">{item.name}</div>
                            <div className="line-meta mono">{item.sku}</div>
                          </div>
                          <div>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateItem(item.productId, { unitPrice: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) =>
                                updateItem(item.productId, { qty: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div>{formatCurrency(Number(item.unitPrice || 0) * Number(item.qty || 0))}</div>
                          <div>
                      <button className="btn ghost" onClick={() => removeItem(item.productId)}>
                        Rimuovi
                      </button>
                          </div>
                        </div>
                      ))}
                      {!lineItems.length ? (
                        <div className="empty">Aggiungi prodotti per creare l'ordine.</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="order-right">
                  <div className="order-card">
                    <div className="card-title">Aggiungi prodotti</div>
                    <div className="order-search">
                      <div className="order-search-header">
                        <label>Cerca prodotto</label>
                        <span className="muted">Seleziona per aggiungere alle righe ordine</span>
                      </div>
                      <div className="order-search-grid">
                        <div className="order-search-input">
                          <input
                            type="search"
                            placeholder="SKU o nome prodotto"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="order-results">
                          {searchResults.length ? (
                            searchResults.map((p) => (
                              <button key={p.id} className="result-item" onClick={() => addItem(p)}>
                                <div className="result-title">{p.name}</div>
                                <div className="result-meta">
                                  <span className="mono">{p.sku}</span>
                                  <span>{formatCurrency(p.price)}</span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="empty small">Nessun risultato</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="order-card order-summary-card">
                    <div className="card-title">Riepilogo</div>
                    <div className="summary-row">
                      <span>Subtotale</span>
                      <strong>{formatCurrency(totals.subtotal)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>IVA</span>
                      <strong>{formatCurrency(totals.vat)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Accise</span>
                      <strong>{formatCurrency(totals.excise)}</strong>
                    </div>
                    <div className="summary-row total">
                      <span>Totale ordine</span>
                      <strong>{formatCurrency(totals.total)}</strong>
                    </div>
                    <div className="summary-actions">
                      <button className="btn ghost" onClick={() => setShowCreate(false)}>
                        Annulla
                      </button>
                      <button className="btn primary" onClick={createOrder} disabled={saving}>
                        {saving ? "Salvataggio..." : "Crea ordine"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {summaryOrder ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setSummaryOrder(null)}>
            <div className="modal order-modal shopify-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Riepilogo ordine</div>
                  <div className="modal-subtitle">
                    {summaryOrder.id.slice(0, 8)} • {summaryOrder.company?.name || "-"}
                  </div>
                </div>
                <button className="btn ghost" onClick={() => setSummaryOrder(null)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body">
                <div className="order-layout">
                  <div className="order-left">
                    <div className="order-card">
                      <div className="card-title">Dettagli</div>
                      <div className="summary-grid">
                        <div>
                          <strong>Stato</strong>
                          <div>{STATUS_OPTIONS.find((s) => s.value === summaryOrder.status)?.label || summaryOrder.status}</div>
                        </div>
                        <div>
                          <strong>Creato</strong>
                          <div>{new Date(summaryOrder.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                    <div className="order-card">
                      <div className="card-title">Righe ordine</div>
                      <div className="order-lines">
                        <div className="order-lines-header">
                          <div>Prodotto</div>
                          <div>Prezzo</div>
                          <div>Qta</div>
                          <div>Totale</div>
                          <div>Fornitore</div>
                        </div>
                        {(summaryOrder.items || []).map((item) => (
                          <div className="order-line" key={item.id}>
                            <div>
                              <div className="line-title">{item.name}</div>
                              <div className="line-meta mono">{item.sku}</div>
                            </div>
                            <div>{formatCurrency(item.unitPrice)}</div>
                            <div>{item.qty}</div>
                            <div>{formatCurrency(item.lineTotal)}</div>
                            <div>{item.product?.sourceSupplier?.name || "-"}</div>
                          </div>
                        ))}
                        {!summaryOrder.items?.length ? (
                          <div className="empty">Nessuna riga ordine.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="order-right">
                    <div className="order-card order-summary-card">
                      <div className="card-title">Totali</div>
                      {(() => {
                        const totals = (summaryOrder.items || []).reduce(
                          (acc, item) => {
                            const lineTotal = Number(item.lineTotal || 0);
                            const qty = Number(item.qty || 0);
                            const product = item.product;
                            const rate = Number(product?.taxRate || product?.taxRateRef?.rate || 0);
                            const vat = rate > 0 ? lineTotal * (rate / 100) : 0;
                            const exciseUnit = Number(
                              product?.exciseTotal ?? (Number(product?.exciseMl || 0) + Number(product?.exciseProduct || 0))
                            );
                            const excise = exciseUnit * qty;
                            acc.revenue += lineTotal;
                            acc.vat += vat;
                            acc.excise += excise;
                            return acc;
                          },
                          { revenue: 0, vat: 0, excise: 0 }
                        );
                        return (
                          <div className="summary-stack">
                            <div className="summary-row">
                              <span>Subtotale</span>
                              <strong>{formatCurrency(totals.revenue)}</strong>
                            </div>
                            <div className="summary-row">
                              <span>IVA totale</span>
                              <strong>{formatCurrency(totals.vat)}</strong>
                            </div>
                            <div className="summary-row">
                              <span>Accise totali</span>
                              <strong>{formatCurrency(totals.excise)}</strong>
                            </div>
                            <div className="summary-row total">
                              <span>Totale ordine</span>
                              <strong>{formatCurrency(totals.revenue + totals.vat + totals.excise)}</strong>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
      {editingOrder ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setEditingOrder(null)}>
            <div className="modal order-modal shopify-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">Modifica ordine</div>
                  <div className="modal-subtitle">Aggiorna dettagli, righe e stato</div>
                </div>
                <button className="btn ghost" onClick={() => setEditingOrder(null)}>
                  Chiudi
                </button>
              </div>
              <div className="modal-body">
                <div className="order-layout">
                  <div className="order-left">
                    <div className="order-card">
                      <div className="card-title">Dettagli ordine</div>
                      <div className="order-form">
                        <div className="field">
                          <label>Azienda</label>
                          <select value={editCompanyId} onChange={(e) => setEditCompanyId(e.target.value)}>
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Stato ordine</label>
                          <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="order-card">
                      <div className="card-title">Righe ordine</div>
                      <div className="order-lines">
                        <div className="order-lines-header">
                          <div>Prodotto</div>
                          <div>Prezzo</div>
                          <div>Qta</div>
                          <div>Totale</div>
                          <div></div>
                        </div>
                        {editLineItems.map((item) => (
                          <div className="order-line" key={item.productId}>
                            <div>
                              <div className="line-title">{item.name}</div>
                              <div className="line-meta mono">{item.sku}</div>
                            </div>
                            <div>
                              <input
                                type="number"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateEditItem(item.productId, { unitPrice: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div>
                              <input
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) =>
                                  updateEditItem(item.productId, { qty: Number(e.target.value) })
                                }
                              />
                            </div>
                            <div>
                              {formatCurrency(Number(item.unitPrice || 0) * Number(item.qty || 0))}
                            </div>
                            <div>
                              <button className="btn ghost" onClick={() => removeEditItem(item.productId)}>
                                Rimuovi
                              </button>
                            </div>
                          </div>
                        ))}
                        {!editLineItems.length ? (
                          <div className="empty">Aggiungi prodotti per creare l'ordine.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="order-right">
                    <div className="order-card">
                      <div className="card-title">Aggiungi prodotti</div>
                      <div className="order-search">
                        <div className="order-search-header">
                          <label>Cerca prodotto</label>
                          <span className="muted">Seleziona per aggiungere alle righe ordine</span>
                        </div>
                        <div className="order-search-grid">
                          <div className="order-search-input">
                            <input
                              type="search"
                              placeholder="SKU o nome prodotto"
                              value={editSearchQuery}
                              onChange={(e) => setEditSearchQuery(e.target.value)}
                            />
                          </div>
                          <div className="order-results">
                            {editSearchResults.length ? (
                              editSearchResults.map((p) => (
                                <button
                                  key={p.id}
                                  className="result-item"
                                  onClick={() => addEditItem(p)}
                                >
                                  <div className="result-title">{p.name}</div>
                                  <div className="result-meta">
                                    <span className="mono">{p.sku}</span>
                                    <span>{formatCurrency(p.price)}</span>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="empty small">Nessun risultato</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="order-card order-summary-card">
                      <div className="card-title">Riepilogo</div>
                      <div className="summary-row">
                        <span>Subtotale</span>
                        <strong>{formatCurrency(editTotals.subtotal)}</strong>
                      </div>
                      <div className="summary-row">
                        <span>IVA</span>
                        <strong>{formatCurrency(editTotals.vat)}</strong>
                      </div>
                      <div className="summary-row">
                        <span>Accise</span>
                        <strong>{formatCurrency(editTotals.excise)}</strong>
                      </div>
                      <div className="summary-row total">
                        <span>Totale ordine</span>
                        <strong>{formatCurrency(editTotals.total)}</strong>
                      </div>
                      <div className="summary-actions">
                        <button className="btn ghost" onClick={() => setEditingOrder(null)}>
                          Annulla
                        </button>
                        <button className="btn ghost" onClick={deleteOrder} disabled={saving}>
                          Elimina
                        </button>
                        <button className="btn primary" onClick={saveEdit} disabled={saving}>
                          {saving ? "Salvataggio..." : "Salva"}
                        </button>
                      </div>
                    </div>
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
