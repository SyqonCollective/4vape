import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

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
  const [companyId, setCompanyId] = useState("");
  const [orderStatus, setOrderStatus] = useState("SUBMITTED");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [saving, setSaving] = useState(false);

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

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.qty || 0),
      0
    );
    return { subtotal };
  }, [lineItems]);

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
          <div>Righe</div>
        </div>
        {items.map((o) => (
          <div className="row" key={o.id}>
            <div className="mono">{o.id.slice(0, 8)}</div>
            <div>{o.company?.name || "-"}</div>
            <div>
              <select
                className="status-select"
                value={o.status}
                onChange={(e) => updateStatus(o.id, e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>{formatCurrency(o.total)}</div>
            <div>{new Date(o.createdAt).toLocaleString()}</div>
            <div>{o.items?.length || 0}</div>
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal order-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Crea ordine manuale</div>
                <div className="modal-subtitle">Compila i dettagli e aggiungi i prodotti</div>
              </div>
              <button className="ghost" onClick={() => setShowCreate(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body">
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
                  <label>Cliente (utente)</label>
                  <div className="field-hint">
                    In arrivo: per ora collega manualmente il referente.
                  </div>
                  <select disabled>
                    <option>Selezione utente non disponibile</option>
                  </select>
                </div>
                <div className="field">
                  <label>Referente (nome)</label>
                  <input
                    type="text"
                    placeholder="Es. Mario Rossi"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Referente (email)</label>
                  <input
                    type="email"
                    placeholder="cliente@azienda.it"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
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
                        onChange={(e) => updateItem(item.productId, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateItem(item.productId, { qty: Number(e.target.value) })}
                      />
                    </div>
                    <div>{formatCurrency(Number(item.unitPrice || 0) * Number(item.qty || 0))}</div>
                    <div>
                      <button className="ghost" onClick={() => removeItem(item.productId)}>
                        Rimuovi
                      </button>
                    </div>
                  </div>
                ))}
                {!lineItems.length ? <div className="empty">Aggiungi prodotti per creare l'ordine.</div> : null}
              </div>

              <div className="order-summary">
                <div>Totale ordine</div>
                <strong>{formatCurrency(totals.subtotal)}</strong>
              </div>

              <div className="actions">
                <button className="ghost" onClick={() => setShowCreate(false)}>
                  Annulla
                </button>
                <button className="primary" onClick={createOrder} disabled={saving}>
                  {saving ? "Salvataggio..." : "Crea ordine"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
