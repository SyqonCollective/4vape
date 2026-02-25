import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

// CHECKLIST (admin richieste):
// [x] Ordini ordinati per arrivo (createdAt desc)
// [x] Modifica ordine: rimozione riga prodotto disponibile
// [x] Accisa prima di IVA nei riepiloghi
// [x] Contatore "Modifica selezionati" corretto

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Bozza" },
  { value: "SUBMITTED", label: "In attesa pagamento" },
  { value: "APPROVED", label: "Elaborazione" },
  { value: "FULFILLED", label: "Completato" },
  { value: "CANCELLED", label: "Fallito" },
];

const PAYMENT_OPTIONS = [
  { value: "BANK_TRANSFER", label: "Bonifico" },
  { value: "CARD", label: "Carta" },
  { value: "COD", label: "Contrassegno" },
  { value: "OTHER", label: "Altro" },
];

const STATUS_DISPLAY_ORDER = ["FULFILLED", "APPROVED", "SUBMITTED", "DRAFT", "CANCELLED"];

const formatCurrency = (value) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    Number(value || 0)
  );

function computeOrderTotals(order) {
  return (order?.items || []).reduce(
    (acc, item) => {
      const lineTotal = Number(item.lineTotal || 0);
      const qty = Number(item.qty || 0);
      const product = item.product;
      const rate = Number(product?.taxRate || product?.taxRateRef?.rate || 0);
      const exciseUnit = Number(
        product?.exciseTotal ?? (Number(product?.exciseMl || 0) + Number(product?.exciseProduct || 0))
      );
      const excise = exciseUnit * qty;
      const vat = rate > 0 ? (lineTotal + excise) * (rate / 100) : 0;
      acc.revenue += lineTotal;
      acc.vat += vat;
      acc.excise += excise;
      return acc;
    },
    { revenue: 0, vat: 0, excise: 0 }
  );
}

export default function AdminOrders() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [summaryOrder, setSummaryOrder] = useState(null);
  const [companyId, setCompanyId] = useState("");
  const [orderStatus, setOrderStatus] = useState("SUBMITTED");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchStatus, setBatchStatus] = useState("APPROVED");
  const [orderStats, setOrderStats] = useState([]);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editStatus, setEditStatus] = useState("SUBMITTED");
  const [editPaymentMethod, setEditPaymentMethod] = useState("BANK_TRANSFER");
  const [editLineItems, setEditLineItems] = useState([]);
  const [editSearchQuery, setEditSearchQuery] = useState("");
  const [editSearchResults, setEditSearchResults] = useState([]);
  const [confirmCompleteOrder, setConfirmCompleteOrder] = useState(null);

  async function loadOrders() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (paymentFilter !== "ALL") params.set("paymentMethod", paymentFilter);
      if (companyFilter) params.set("companyId", companyFilter);
      if (groupFilter !== "ALL") params.set("groupName", groupFilter);
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      const res = await api(`/admin/orders${params.toString() ? `?${params.toString()}` : ""}`);
      setItems(res);
      setSelectedIds([]);
    } catch (err) {
      setError("Impossibile caricare ordini");
    }
  }

  async function loadOrderStats() {
    try {
      const res = await api("/admin/orders/stats");
      setOrderStats(res || []);
    } catch {
      setOrderStats([]);
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
    loadOrderStats();
  }, [statusFilter, paymentFilter, companyFilter, groupFilter, startDate, endDate]);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (editingOrder) {
      loadCompanies();
      setEditCompanyId(editingOrder.companyId || "");
      setEditStatus(editingOrder.status || "SUBMITTED");
      setEditPaymentMethod(editingOrder.paymentMethod || "BANK_TRANSFER");
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
        const exciseUnit = Number(
          item.exciseTotal ?? (Number(item.exciseMl || 0) + Number(item.exciseProduct || 0))
        );
        const excise = exciseUnit * Number(item.qty || 0);
        const vat = rate > 0 ? (lineTotal + excise) * (rate / 100) : 0;
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
        const exciseUnit = Number(
          item.exciseTotal ?? (Number(item.exciseMl || 0) + Number(item.exciseProduct || 0))
        );
        const excise = exciseUnit * Number(item.qty || 0);
        const vat = rate > 0 ? (lineTotal + excise) * (rate / 100) : 0;
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

  const orderedStats = useMemo(() => {
    const byStatus = new Map((orderStats || []).map((s) => [s.status, Number(s.count || 0)]));
    return STATUS_DISPLAY_ORDER.map((status) => ({ status, count: byStatus.get(status) || 0 }));
  }, [orderStats]);

  const orderedItems = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [items]);

  const selectedCount = useMemo(() => new Set(selectedIds).size, [selectedIds]);

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
          paymentMethod,
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
      await loadOrderStats();
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
      await loadOrderStats();
    } catch (err) {
      setError("Impossibile aggiornare lo stato");
    }
  }

  async function createInvoiceFromOrder(orderId) {
    try {
      await api(`/admin/invoices/from-order/${orderId}`, { method: "POST" });
      await loadOrders();
    } catch {
      setError("Impossibile generare fattura da ordine");
    }
  }

  async function updateBatchStatus() {
    if (!selectedIds.length) return;
    try {
      await api("/admin/orders/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedIds, status: batchStatus }),
      });
      await loadOrders();
      await loadOrderStats();
    } catch {
      setError("Impossibile aggiornare ordini selezionati");
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
          paymentMethod: editPaymentMethod,
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
      await loadOrderStats();
    } catch (err) {
      setError("Impossibile eliminare ordine");
    } finally {
      setSaving(false);
    }
  }

  function statusMeta(status) {
    if (status === "SUBMITTED") return { label: "In attesa pagamento", cls: "status pending" };
    if (status === "APPROVED") return { label: "Elaborazione", cls: "status processing" };
    if (status === "FULFILLED") return { label: "Completato", cls: "status completed" };
    if (status === "CANCELLED") return { label: "Fallito", cls: "status failed" };
    return { label: "Bozza", cls: "status draft" };
  }

  function paymentLabel(value) {
    return PAYMENT_OPTIONS.find((p) => p.value === value)?.label || value || "-";
  }

  function printSummary(order) {
    if (!order) return;
    const company = order.company || {};
    const safe = (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    const totals = computeOrderTotals(order);
    const rows = (order.items || [])
      .map(
        (item) => `
        <tr>
          <td>${safe(item.name || "-")}</td>
          <td>${safe(item.sku || "-")}</td>
          <td>${Number(item.qty || 0)}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
          <td>${formatCurrency(item.lineTotal)}</td>
          <td>${safe(item.product?.sourceSupplier?.name || "-")}</td>
        </tr>`
      )
      .join("");
    const customerContact =
      [company.contactFirstName, company.contactLastName].filter(Boolean).join(" ").trim() || "-";
    const customerAddress = [company.address, company.cap, company.city, company.province]
      .filter(Boolean)
      .join(", ");
    const shippingAddress =
      [
        order.shippingAddress,
        order.shippingAddressLine1,
        order.shippingAddressLine2,
        [order.shippingCap, order.shippingCity, order.shippingProvince].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ") || customerAddress || "-";
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) {
      setError("Popup bloccato: abilita i popup per stampare.");
      return;
    }
    const title = `Ordine #${order.orderNumber || "-"}`;
    const created = new Date(order.createdAt).toLocaleString("it-IT");
    w.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
            h1{margin:0 0 8px}
            .meta{margin:0 0 18px;color:#475569}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 14px}
            .card{border:1px solid #cbd5e1;border-radius:10px;padding:12px}
            .card h3{margin:0 0 10px;font-size:14px;color:#334155;text-transform:uppercase;letter-spacing:.04em}
            .line{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
            .line:last-child{border-bottom:0}
            table{width:100%;border-collapse:collapse;margin-top:14px}
            th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}
            th{background:#f8fafc}
            .tot{margin-top:16px;display:grid;gap:6px;max-width:340px;margin-left:auto}
            .tot div{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:3px 0}
            .tot .grand{font-weight:700;font-size:15px}
          </style>
        </head>
        <body>
          <h1>${safe(title)}</h1>
          <div class="meta">${safe(company.name || "-")} • ${safe(created)}</div>
          <div class="grid">
            <div class="card">
              <h3>Dati cliente</h3>
              <div class="line"><span>Azienda</span><strong>${safe(company.legalName || company.name || "-")}</strong></div>
              <div class="line"><span>Referente</span><strong>${safe(customerContact)}</strong></div>
              <div class="line"><span>P.IVA</span><strong>${safe(company.vatNumber || "-")}</strong></div>
              <div class="line"><span>Cod. univoco</span><strong>${safe(company.sdiCode || "-")}</strong></div>
              <div class="line"><span>Email</span><strong>${safe(company.email || "-")}</strong></div>
              <div class="line"><span>Telefono</span><strong>${safe(company.phone || "-")}</strong></div>
              <div class="line"><span>Indirizzo cliente</span><strong>${safe(customerAddress || "-")}</strong></div>
            </div>
            <div class="card">
              <h3>Indirizzo di spedizione</h3>
              <div style="font-size:14px;line-height:1.5">${safe(shippingAddress)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>SKU</th>
                <th>Qta</th>
                <th>Prezzo</th>
                <th>Totale</th>
                <th>Fornitore</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6">Nessuna riga ordine.</td></tr>'}</tbody>
          </table>
          <div class="tot">
            <div><span>Subtotale</span><strong>${formatCurrency(totals.revenue)}</strong></div>
            <div><span>Accise</span><strong>${formatCurrency(totals.excise)}</strong></div>
            <div><span>IVA</span><strong>${formatCurrency(totals.vat)}</strong></div>
            <div class="grand"><span>Totale ordine</span><strong>${formatCurrency(
              totals.revenue + totals.vat + totals.excise
            )}</strong></div>
          </div>
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    w.document.close();
  }

  const companyGroups = useMemo(
    () =>
      Array.from(new Set((companies || []).map((c) => c.groupName).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b), "it")
      ),
    [companies]
  );

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
        <div className="filter-group">
          <label>Pagamento</label>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="ALL">Tutti</option>
            {PAYMENT_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Cliente</label>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">Tutti</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Gruppo cliente</label>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="ALL">Tutti</option>
            {companyGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Da</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>A</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="orders-stats">
        {orderedStats.map((s) => {
          const meta = statusMeta(s.status);
          return (
            <div key={s.status} className={`orders-stat-card ${meta.cls}`}>
              <span>{meta.label}</span>
              <strong>{s.count}</strong>
            </div>
          );
        })}
      </div>

      <div className="orders-bulk-row">
        <select value={batchStatus} onChange={(e) => setBatchStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn ghost" onClick={updateBatchStatus} disabled={!selectedCount}>
          Modifica selezionati ({selectedCount})
        </button>
      </div>

      <div className="orders-table">
        <div className="row header">
          <div>
            <input
              type="checkbox"
              checked={orderedItems.length > 0 && selectedCount === orderedItems.length}
              onChange={(e) =>
                setSelectedIds(e.target.checked ? orderedItems.map((o) => o.id) : [])
              }
            />
          </div>
          <div>Ordine #</div>
          <div>Azienda</div>
          <div>Referente</div>
          <div>Stato</div>
          <div>Pagamento</div>
          <div>Totale</div>
          <div>Creato</div>
          <div></div>
        </div>
        {orderedItems.map((o) => (
          <div className="row" key={o.id} onClick={() => setSummaryOrder(o)}>
            <div>
              <input
                type="checkbox"
                checked={selectedIds.includes(o.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setSelectedIds((prev) => {
                    if (e.target.checked) {
                      return Array.from(new Set([...prev, o.id]));
                    }
                    return prev.filter((id) => id !== o.id);
                  })
                }
              />
            </div>
            <div className="mono">{o.orderNumber || "-"}</div>
            <div>{o.company?.name || "-"}</div>
            <div>
              {(o.company?.contactFirstName || o.company?.contactLastName)
                ? `${o.company?.contactFirstName || ""} ${o.company?.contactLastName || ""}`.trim()
                : (o.company?.email || "-")}
            </div>
            <div>
              <span className={statusMeta(o.status).cls}>{statusMeta(o.status).label}</span>
            </div>
            <div>{paymentLabel(o.paymentMethod)}</div>
            <div>{formatCurrency(o.total)}</div>
            <div>{new Date(o.createdAt).toLocaleString()}</div>
            <div>
              {o.fiscalInvoice ? <span className="tag success">Fatturato</span> : null}
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus(o.id, "APPROVED");
                }}
                disabled={Boolean(o.fiscalInvoice)}
              >
                In elaborazione
              </button>
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmCompleteOrder(o);
                }}
                disabled={Boolean(o.fiscalInvoice)}
              >
                Completato
              </button>
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingOrder(o);
                }}
                disabled={Boolean(o.fiscalInvoice)}
              >
                Modifica
              </button>
              {o.fiscalInvoice ? (
                <button
                  className="btn ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/admin/invoices");
                  }}
                >
                  Vedi fattura
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    createInvoiceFromOrder(o.id);
                  }}
                >
                  Fattura
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmCompleteOrder ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmCompleteOrder(null)}>
            <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Conferma completamento</h3>
              <p>
                Sei sicuro di voler segnare come completato l&apos;ordine{" "}
                <strong>{confirmCompleteOrder.orderNumber || confirmCompleteOrder.id}</strong>?
              </p>
              <div className="actions">
                <button className="btn ghost" onClick={() => setConfirmCompleteOrder(null)}>
                  Annulla
                </button>
                <button
                  className="btn primary"
                  onClick={async () => {
                    const orderId = confirmCompleteOrder.id;
                    setConfirmCompleteOrder(null);
                    await updateStatus(orderId, "FULFILLED");
                  }}
                >
                  Conferma
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

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
                  <div className="field">
                    <label>Metodo pagamento</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      {PAYMENT_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
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
                      <span>Accise</span>
                      <strong>{formatCurrency(totals.excise)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>IVA</span>
                      <strong>{formatCurrency(totals.vat)}</strong>
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
                    #{summaryOrder.orderNumber || "-"} • {summaryOrder.company?.name || "-"}
                  </div>
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => printSummary(summaryOrder)} title="Stampa riepilogo ordine">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginRight: 6 }}>
                      <path d="M7 8V3h10v5M6 17H4a1 1 0 0 1-1-1v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a1 1 0 0 1-1 1h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <rect x="7" y="14" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.8"/>
                    </svg>
                    Stampa
                  </button>
                  <button className="btn ghost" onClick={() => setSummaryOrder(null)}>
                    Chiudi
                  </button>
                </div>
              </div>
              <div className="modal-body">
                <div className="order-layout">
                  <div className="order-left">
                    <div className="order-card">
                      <div className="card-title">Dettagli</div>
                      <div className="summary-grid">
                        <div>
                          <strong>Stato</strong>
                          <div>{statusMeta(summaryOrder.status).label}</div>
                        </div>
                        <div>
                          <strong>Pagamento</strong>
                          <div>{paymentLabel(summaryOrder.paymentMethod)}</div>
                        </div>
                        <div>
                          <strong>Creato</strong>
                          <div>{new Date(summaryOrder.createdAt).toLocaleString()}</div>
                        </div>
                        <div>
                          <strong>Referente</strong>
                          <div>
                            {(summaryOrder.company?.contactFirstName || summaryOrder.company?.contactLastName)
                              ? `${summaryOrder.company?.contactFirstName || ""} ${summaryOrder.company?.contactLastName || ""}`.trim()
                              : (summaryOrder.company?.email || "-")}
                          </div>
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
                        const totals = computeOrderTotals(summaryOrder);
                        return (
                          <div className="summary-stack">
                            <div className="summary-row">
                              <span>Subtotale</span>
                              <strong>{formatCurrency(totals.revenue)}</strong>
                            </div>
                            <div className="summary-row">
                              <span>Accise totali</span>
                              <strong>{formatCurrency(totals.excise)}</strong>
                            </div>
                            <div className="summary-row">
                              <span>IVA totale</span>
                              <strong>{formatCurrency(totals.vat)}</strong>
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
                        <div className="field">
                          <label>Metodo pagamento</label>
                          <select
                            value={editPaymentMethod}
                            onChange={(e) => setEditPaymentMethod(e.target.value)}
                          >
                            {PAYMENT_OPTIONS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
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
                        <span>Accise</span>
                        <strong>{formatCurrency(editTotals.excise)}</strong>
                      </div>
                      <div className="summary-row">
                        <span>IVA</span>
                        <strong>{formatCurrency(editTotals.vat)}</strong>
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
