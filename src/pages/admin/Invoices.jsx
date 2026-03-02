import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";
import logoUrl from "../../assets/logo.png";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const LEGAL_COURTESY_NOTE =
  "Fattura di cortesia senza valenza fiscale. L\u2019originale \u00e8 disponibile nel tuo cassetto fiscale.";

const PRINT_STYLES = `body{font-family:Arial,sans-serif;color:#0f172a;padding:22px}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px}.logo{height:56px;object-fit:contain}.company{font-size:13px;line-height:1.45;text-align:right;color:#334155}h1{margin:0 0 8px;font-size:26px}.meta{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:0 0 14px}.meta .box{border:1px solid #cbd5e1;border-radius:9px;padding:8px 10px}.meta .k{font-size:11px;text-transform:uppercase;color:#64748b}.meta .v{font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #cbd5e1;padding:8px 9px;text-align:left;font-size:13px}th{background:#f8fafc;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#475569}.right{text-align:right}.tot{margin-left:auto;max-width:340px;display:grid;gap:5px;margin-top:14px}.tot .r{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:4px 0}.tot .grand{font-weight:800;font-size:16px}.foot{margin-top:22px;color:#64748b;font-size:12px}`;

function calcLineTotals(lines) {
  const imponibile = lines.reduce((s, l) => s + (Number(l.unitGross) * Number(l.qty) - Number(l.exciseTotal) - Number(l.vatTotal)), 0);
  const accisa = lines.reduce((s, l) => s + Number(l.exciseTotal), 0);
  const iva = lines.reduce((s, l) => s + Number(l.vatTotal), 0);
  const total = lines.reduce((s, l) => s + Number(l.unitGross) * Number(l.qty), 0);
  return { imponibile, accisa, iva, total };
}

const PAYMENT_LABELS = {
  BANK_TRANSFER: "Bonifico",
  CARD: "Carta",
  COD: "Contrassegno",
  CASH: "Contanti",
  OTHER: "Altro",
};
const payLabel = (v) => PAYMENT_LABELS[v] || v || "-";

const fmtDate = (v) => {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("it-IT");
};

function toDateInput(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function exportCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminInvoices() {
  const today = toDateInput(new Date());
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("table");

  // Manual invoice
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manual, setManual] = useState({ invoiceNumber: "", issuedAt: today, companyId: "" });
  const [manualLines, setManualLines] = useState([]);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState([]);

  // Detail
  const [detail, setDetail] = useState(null);

  // Edit
  const [editRow, setEditRow] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editLines, setEditLines] = useState([]);
  const [editSearch, setEditSearch] = useState("");
  const [editResults, setEditResults] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [sendingEmail, setSendingEmail] = useState(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      if (status) params.set("status", status);
      if (companyId) params.set("companyId", companyId);
      const res = await api(`/admin/invoices?${params.toString()}`);
      setRows(res || []);
      setError("");
    } catch {
      setError("Impossibile caricare fatture");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate, status, companyId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/admin/companies");
        setCompanies((res || []).filter((c) => c.status === "ACTIVE"));
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

  // Product search - manual
  useEffect(() => {
    let active = true;
    if (!manualSearch.trim()) { setManualResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api(`/admin/products?q=${encodeURIComponent(manualSearch.trim())}&limit=20&orderBy=name-asc`);
        if (active) setManualResults(res || []);
      } catch { if (active) setManualResults([]); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [manualSearch]);

  // Product search - edit
  useEffect(() => {
    let active = true;
    if (!editSearch.trim()) { setEditResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api(`/admin/products?q=${encodeURIComponent(editSearch.trim())}&limit=20&orderBy=name-asc`);
        if (active) setEditResults(res || []);
      } catch { if (active) setEditResults([]); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [editSearch]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.total += Number(r.totaleFattura || 0);
          acc.imponibile += Number(r.imponibileProdotti || 0);
          acc.accisa += Number(r.accisa || 0);
          acc.iva += Number(r.iva || 0);
          return acc;
        },
        { total: 0, imponibile: 0, accisa: 0, iva: 0 }
      ),
    [rows]
  );
  const companyById = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies]
  );
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.numero || ""} ${r.cliente || ""} ${r.riferimentoOrdine || ""}`.toLowerCase().includes(q)
    );
  }, [rows, query]);

  function openPrintDocument(title, htmlBody) {
    const w = window.open("", "_blank", "width=1200,height=860");
    if (!w) { setError("Popup bloccato: abilita i popup per stampare."); return; }
    w.document.write(`<html><head><meta charset="utf-8"/><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${htmlBody}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    w.document.close();
  }

  function buildLinesHtml(lines) {
    if (!lines || !lines.length) return "";
    const trs = lines.map((l) => {
      const imp = Number(l.unitGross) - (Number(l.exciseTotal) + Number(l.vatTotal)) / Math.max(l.qty, 1);
      return `<tr><td>${l.sku || "-"}</td><td>${l.productName || "-"}</td><td class="right">${l.qty}</td><td class="right">${money(imp)}</td><td class="right">${money(l.exciseTotal)}</td><td class="right">${money(l.vatTotal)}</td><td class="right">${money(Number(l.unitGross) * Number(l.qty))}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>SKU</th><th>Prodotto</th><th class="right">Qtà</th><th class="right">Impon. unit.</th><th class="right">Accisa</th><th class="right">IVA</th><th class="right">Totale</th></tr></thead><tbody>${trs}</tbody></table>`;
  }

  function buildInvoiceDocument(row, docTitle) {
    const c = row.company || companyById.get(row.companyId) || {};
    const clientAddress = [c.address, c.cap, c.city, c.province].filter(Boolean).join(", ") || "-";
    const lines = row.lines || [];
    const t = calcLineTotals(lines);
    return `
      <div class="head"><img class="logo" src="${logoUrl}" alt="4Vape" /><div class="company"><strong>4Vape B2B</strong><br/>${docTitle}</div></div>
      <h1>${docTitle} ${row.numero || "-"}</h1>
      <div class="meta">
        <div class="box"><div class="k">Data</div><div class="v">${fmtDate(row.data)}</div></div>
        <div class="box"><div class="k">Stato</div><div class="v">${row.stato === "SALDATA" ? "Saldata" : "Da saldare"}</div></div>
        <div class="box"><div class="k">Pagamento</div><div class="v">${payLabel(row.pagamento)}</div></div>
        <div class="box"><div class="k">Ordine</div><div class="v">${row.riferimentoOrdine || "-"}</div></div>
      </div>
      <table><thead><tr><th>Intestatario</th><th>P.IVA</th><th>Indirizzo</th></tr></thead>
        <tbody><tr><td>${row.cliente || "-"}</td><td>${c.vatNumber || c.adminVatNumber || "-"}</td><td>${clientAddress}</td></tr></tbody></table>
      ${buildLinesHtml(lines)}
      <div class="tot">
        <div class="r"><span>Imponibile prodotti</span><span>${money(t.imponibile)}</span></div>
        <div class="r"><span>Accisa</span><span>${money(t.accisa)}</span></div>
        <div class="r"><span>IVA</span><span>${money(t.iva)}</span></div>
        <div class="r grand"><span>Totale fattura</span><span>${money(t.total)}</span></div>
      </div>
      <div class="foot">${LEGAL_COURTESY_NOTE}</div>`;
  }

  function printInvoice(row) {
    openPrintDocument(`Fattura ${row.numero}`, buildInvoiceDocument(row, "Fattura"));
  }

  function printDDT(row) {
    const c = row.company || companyById.get(row.companyId) || {};
    const clientAddress = [c.address, c.cap, c.city, c.province].filter(Boolean).join(", ") || "-";
    const lines = (row.lines || []).filter((l) => l.sku !== "SHIPPING");
    const totQty = lines.reduce((s, l) => s + Number(l.qty), 0);
    const linesRows = lines.map((l) =>
      `<tr><td>${l.sku || "-"}</td><td>${l.productName || "-"}</td><td class="right">${l.qty}</td></tr>`
    ).join("");
    const body = `
      <div class="head"><img class="logo" src="${logoUrl}" alt="4Vape" /><div class="company"><strong>4Vape B2B</strong><br/>Documento di trasporto</div></div>
      <h1>DDT - Documento di trasporto</h1>
      <div class="meta">
        <div class="box"><div class="k">Fattura</div><div class="v">${row.numero || "-"}</div></div>
        <div class="box"><div class="k">Data</div><div class="v">${fmtDate(row.data)}</div></div>
        <div class="box"><div class="k">Ordine</div><div class="v">${row.riferimentoOrdine || "-"}</div></div>
        <div class="box"><div class="k">Colli</div><div class="v">${totQty}</div></div>
      </div>
      <table><thead><tr><th>Destinatario</th><th>P.IVA</th><th>Indirizzo</th></tr></thead>
        <tbody><tr><td>${row.cliente || "-"}</td><td>${c.vatNumber || c.adminVatNumber || "-"}</td><td>${clientAddress}</td></tr></tbody></table>
      <table><thead><tr><th>SKU</th><th>Prodotto</th><th class="right">Qtà</th></tr></thead>
        <tbody>${linesRows || '<tr><td colspan="3">Nessun prodotto</td></tr>'}</tbody></table>
      <div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
        <div style="border-top:1px solid #cbd5e1;padding-top:8px;font-size:12px;color:#64748b">Firma mittente</div>
        <div style="border-top:1px solid #cbd5e1;padding-top:8px;font-size:12px;color:#64748b">Firma vettore</div>
        <div style="border-top:1px solid #cbd5e1;padding-top:8px;font-size:12px;color:#64748b">Firma destinatario</div>
      </div>`;
    openPrintDocument(`DDT ${row.numero}`, body);
  }

  function downloadPDF(row) {
    const w = window.open("", "_blank", "width=1200,height=860");
    if (!w) { setError("Popup bloccato: abilita i popup."); return; }
    w.document.write(`<html><head><meta charset="utf-8"/><title>Fattura ${row.numero}</title><style>${PRINT_STYLES} .no-print{margin-bottom:14px;text-align:center} @media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()" style="padding:10px 28px;font-size:15px;cursor:pointer;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc">Salva come PDF (Ctrl+P → PDF)</button></div>${buildInvoiceDocument(row, "Fattura")}</body></html>`);
    w.document.close();
  }

  function printRegister() {
    const bodyRows = visibleRows.map((r) =>
      `<tr><td>${r.numero || "-"}</td><td>${fmtDate(r.data)}</td><td>${r.cliente || "-"}</td><td>${r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</td><td>${payLabel(r.pagamento)}</td><td class="right">${money(r.totaleFattura)}</td></tr>`
    ).join("");
    const body = `
      <div class="head"><img class="logo" src="${logoUrl}" alt="4Vape" /><div class="company"><strong>Registro Fatture</strong><br/>Periodo: ${fmtDate(startDate)} - ${fmtDate(endDate)}</div></div>
      <h1>Registro fatture</h1>
      <table><thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Stato</th><th>Pagamento</th><th class="right">Totale</th></tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="6">Nessuna fattura</td></tr>'}</tbody></table>
      <div class="tot">
        <div class="r"><span>Totale</span><span>${money(totals.total)}</span></div>
        <div class="r"><span>Imponibile</span><span>${money(totals.imponibile)}</span></div>
        <div class="r"><span>Accisa</span><span>${money(totals.accisa)}</span></div>
        <div class="r"><span>IVA</span><span>${money(totals.iva)}</span></div>
      </div>
      <div class="foot">${LEGAL_COURTESY_NOTE}</div>`;
    openPrintDocument("Registro fatture", body);
  }

  async function togglePaid(row) {
    try {
      await api("/admin/treasury/mark-paid", {
        method: "PATCH",
        body: JSON.stringify({
          sourceType: "FISCAL_INVOICE",
          sourceId: row.id,
          paid: row.stato !== "SALDATA",
        }),
      });
      await load();
    } catch {
      setError("Impossibile aggiornare stato fattura");
    }
  }

  function makeLineFromProduct(p) {
    return { productId: p.id, sku: p.sku || "", productName: p.name || "", codicePl: p.codicePl || "", mlProduct: p.mlProduct || 0, nicotine: p.nicotine || 0, qty: 1, unitGross: Number(p.price || 0), exciseUnit: Number(p.exciseUnit || 0), exciseTotal: Number(p.exciseUnit || 0), vatTotal: Number(p.price || 0) * 0.22, purchasePrice: Number(p.purchasePrice || 0) };
  }
  function addManualLine(product) { setManualLines((p) => [...p, makeLineFromProduct(product)]); setManualSearch(""); setManualResults([]); }
  function updateManualLine(i, field, val) { setManualLines((p) => p.map((l, j) => j === i ? { ...l, [field]: val } : l)); }
  function removeManualLine(i) { setManualLines((p) => p.filter((_, j) => j !== i)); }
  function addEditLine(product) { setEditLines((p) => [...p, makeLineFromProduct(product)]); setEditSearch(""); setEditResults([]); }
  function updateEditLine(i, field, val) { setEditLines((p) => p.map((l, j) => j === i ? { ...l, [field]: val } : l)); }
  function removeEditLine(i) { setEditLines((p) => p.filter((_, j) => j !== i)); }

  async function createManualInvoice() {
    if (!manualLines.length) { setError("Aggiungi almeno un prodotto"); return; }
    try {
      setSavingManual(true);
      await api("/admin/invoices/manual", {
        method: "POST",
        body: JSON.stringify({
          invoiceNumber: manual.invoiceNumber,
          issuedAt: manual.issuedAt,
          companyId: manual.companyId,
          paymentMethod: manual.paymentMethod,
          lines: manualLines.map((l) => ({
            productId: l.productId || undefined,
            sku: l.sku,
            productName: l.productName,
            codicePl: l.codicePl,
            mlProduct: Number(l.mlProduct || 0),
            nicotine: Number(l.nicotine || 0),
            qty: Number(l.qty || 1),
            unitGross: Number(l.unitGross || 0),
            exciseUnit: Number(l.exciseUnit || 0),
            exciseTotal: Number(l.exciseTotal || 0),
            vatTotal: Number(l.vatTotal || 0),
          })),
        }),
      });
      setShowManual(false);
      setManual({ invoiceNumber: "", issuedAt: today, companyId: "" });
      setManualLines([]);
      await load();
    } catch {
      setError("Impossibile creare fattura manuale");
    } finally {
      setSavingManual(false);
    }
  }

  async function deleteInvoice(row) {
    if (!confirm(`Eliminare la fattura ${row.numero}?`)) return;
    try {
      await api(`/admin/invoices/${row.id}`, { method: "DELETE" });
      setDetail(null);
      await load();
    } catch {
      setError("Impossibile eliminare fattura");
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setEditDraft({
      invoiceNumber: row.numero || "",
      issuedAt: toDateInput(row.data),
    });
    setEditLines((row.lines || []).map((l) => ({ ...l, qty: Number(l.qty), unitGross: Number(l.unitGross), exciseUnit: Number(l.exciseUnit || 0), exciseTotal: Number(l.exciseTotal || 0), vatTotal: Number(l.vatTotal || 0) })));
  }

  async function saveEdit() {
    if (!editRow || !editDraft) return;
    setSavingEdit(true);
    try {
      await api(`/admin/invoices/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          invoiceNumber: editDraft.invoiceNumber,
          issuedAt: editDraft.issuedAt,
          lines: editLines.map((l) => ({
            productId: l.productId || undefined,
            sku: l.sku,
            productName: l.productName,
            codicePl: l.codicePl || "",
            mlProduct: Number(l.mlProduct || 0),
            nicotine: Number(l.nicotine || 0),
            qty: Number(l.qty || 1),
            unitGross: Number(l.unitGross || 0),
            exciseUnit: Number(l.exciseUnit || 0),
            exciseTotal: Number(l.exciseTotal || 0),
            vatTotal: Number(l.vatTotal || 0),
          })),
        }),
      });
      setEditRow(null);
      setEditDraft(null);
      setEditLines([]);
      await load();
    } catch {
      setError("Impossibile aggiornare fattura");
    } finally {
      setSavingEdit(false);
    }
  }

  async function sendInvoiceEmail(row) {
    setSendingEmail(row.id);
    try {
      const res = await api(`/admin/invoices/${row.id}/send-email`, { method: "POST" });
      alert(`Email inviata a ${res.sentTo}`);
    } catch {
      setError("Impossibile inviare email fattura");
    } finally {
      setSendingEmail(null);
    }
  }

  function exportCurrentCsv() {
    exportCsv(
      "fatture.csv",
      [
        "Numero",
        "Data",
        "Cliente",
        "Stato",
        "Pagamento",
        "Totale fattura",
        "Imponibile prodotti",
        "Accisa",
        "IVA",
        "Riferimento ordine",
        "Guadagno",
        "Nota legale",
      ],
      visibleRows.map((r) => [
        r.numero,
        fmtDate(r.data),
        r.cliente,
        r.stato,
        r.pagamento,
        Number(r.totaleFattura || 0).toFixed(2),
        Number(r.imponibileProdotti || 0).toFixed(2),
        Number(r.accisa || 0).toFixed(2),
        Number(r.iva || 0).toFixed(2),
        r.riferimentoOrdine || "",
        Number(r.guadagno || 0).toFixed(2),
        LEGAL_COURTESY_NOTE,
      ])
    );
  }

  function exportSingleInvoice(row) {
    exportCsv(
      `fattura_${row.numero}.csv`,
      [
        "Numero",
        "Data",
        "Cliente",
        "Stato",
        "Pagamento",
        "Totale fattura",
        "Imponibile prodotti",
        "Accisa",
        "IVA",
        "Riferimento ordine",
        "Guadagno",
        "Nota legale",
      ],
      [[
        row.numero,
        fmtDate(row.data),
        row.cliente,
        row.stato,
        row.pagamento,
        Number(row.totaleFattura || 0).toFixed(2),
        Number(row.imponibileProdotti || 0).toFixed(2),
        Number(row.accisa || 0).toFixed(2),
        Number(row.iva || 0).toFixed(2),
        row.riferimentoOrdine || "",
        Number(row.guadagno || 0).toFixed(2),
        LEGAL_COURTESY_NOTE,
      ]]
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Fatture</h1>
          <p>Fatture emesse con stato pagamento integrato tesoreria</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="invoices-toolbar">
        <div className="invoices-toolbar-top">
          <input
            className="invoices-search"
            placeholder="Cerca numero, cliente o riferimento ordine"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="products-view-switch">
            <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
            <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
          </div>
        </div>
      <div className="filters-row">
        <div className="filter-group">
          <label>Data dal</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Data al</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Stato</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tutti</option>
            <option value="DA_SALDARE">Da saldare</option>
            <option value="SALDATA">Saldata</option>
          </select>
        </div>
        <div className="filter-group" style={{ minWidth: 300 }}>
          <label>Cliente</label>
          <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Tutti</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={exportCurrentCsv}>Esporta CSV</button>
          <button className="btn ghost" onClick={printRegister}>Stampa registro</button>
          <button className="btn primary" onClick={() => setShowManual(true)}>Fattura manuale</button>
        </div>
      </div>
      </div>

      <div className="cards">
        <div className="card"><div className="card-label">Fatture</div><div className="card-value">{rows.length}</div></div>
        <div className="card"><div className="card-label">Totale</div><div className="card-value">{money(totals.total)}</div></div>
        <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(totals.imponibile)}</div></div>
        <div className="card"><div className="card-label">Accisa</div><div className="card-value">{money(totals.accisa)}</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{money(totals.iva)}</div></div>
      </div>

      {viewMode === "table" ? (
      <div className="table wide-report invoices-table-pro">
        <div className="row header">
          <div>Numero</div>
          <div>Data</div>
          <div>Cliente</div>
          <div>Stato</div>
          <div>Pagamento</div>
          <div>Totale</div>
          <div>Ordine</div>
          <div>Azioni</div>
        </div>
        {visibleRows.map((r) => (
          <div className="row" key={r.id} onClick={() => setDetail(r)} style={{ cursor: "pointer" }}>
            <div className="mono">{r.numero}</div>
            <div>{fmtDate(r.data)}</div>
            <div>{r.cliente || "-"}</div>
            <div><span className={`tag ${r.stato === "SALDATA" ? "success" : "warn"}`}>{r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</span></div>
            <div>{payLabel(r.pagamento)}</div>
            <div>{money(r.totaleFattura)}</div>
            <div>{r.riferimentoOrdine || "-"}</div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn ghost small" onClick={() => togglePaid(r)}>{r.stato === "SALDATA" ? "Da saldare" : "Saldata"}</button>
              <button className="btn ghost small" onClick={() => openEdit(r)}>Modifica</button>
              <button className="btn ghost small" onClick={() => printInvoice(r)}>Stampa</button>
              <button className="btn ghost small" onClick={() => printDDT(r)}>DDT</button>
              <button className="btn ghost small" onClick={() => downloadPDF(r)}>PDF</button>
              <button className="btn ghost small" onClick={() => sendInvoiceEmail(r)} disabled={sendingEmail === r.id}>{sendingEmail === r.id ? "Invio..." : "Email"}</button>
              <button className="btn ghost small" onClick={() => exportSingleInvoice(r)}>CSV</button>
              <button className="btn ghost small danger" onClick={() => deleteInvoice(r)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>
      ) : (
        <div className="invoices-cards">
          {visibleRows.map((r) => (
            <article key={r.id} className="invoices-card" onClick={() => setDetail(r)} style={{ cursor: "pointer" }}>
              <div className="invoices-card-top">
                <strong className="mono">{r.numero}</strong>
                <span className={`tag ${r.stato === "SALDATA" ? "success" : "warn"}`}>{r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</span>
              </div>
              <div><strong>{r.cliente || "-"}</strong></div>
              <div className="muted">{fmtDate(r.data)} · {payLabel(r.pagamento)}</div>
              <div className="invoices-card-totals">
                <span>{money(r.totaleFattura)}</span>
                <span>Ordine {r.riferimentoOrdine || "-"}</span>
              </div>
              <div className="actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost small" onClick={() => togglePaid(r)}>{r.stato === "SALDATA" ? "Da saldare" : "Saldata"}</button>
                <button className="btn ghost small" onClick={() => openEdit(r)}>Modifica</button>
                <button className="btn ghost small" onClick={() => printInvoice(r)}>Stampa</button>
                <button className="btn ghost small" onClick={() => printDDT(r)}>DDT</button>
                <button className="btn ghost small" onClick={() => downloadPDF(r)}>PDF</button>
                <button className="btn ghost small" onClick={() => sendInvoiceEmail(r)} disabled={sendingEmail === r.id}>{sendingEmail === r.id ? "Invio..." : "Email"}</button>
                <button className="btn ghost small danger" onClick={() => deleteInvoice(r)}>Elimina</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showManual ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowManual(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
              <div className="modal-header">
                <h3>Nuova fattura manuale</h3>
                <button className="btn ghost" onClick={() => setShowManual(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>Numero fattura<input value={manual.invoiceNumber} onChange={(e) => setManual((p) => ({ ...p, invoiceNumber: e.target.value }))} /></label>
                  <label>Data<input type="date" value={manual.issuedAt} onChange={(e) => setManual((p) => ({ ...p, issuedAt: e.target.value }))} /></label>
                  <label>Cliente<select className="select" value={manual.companyId} onChange={(e) => setManual((p) => ({ ...p, companyId: e.target.value }))}><option value="">Seleziona</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                </div>
                <LinesEditor lines={manualLines} search={manualSearch} setSearch={setManualSearch} results={manualResults} onAdd={addManualLine} onUpdate={updateManualLine} onRemove={removeManualLine} />
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowManual(false)}>Annulla</button>
                  <button className="btn primary" onClick={createManualInvoice} disabled={savingManual || !manualLines.length}>{savingManual ? "Salvataggio..." : "Crea fattura"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {detail && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
              <div className="modal-header">
                <div className="modal-title"><h3>Fattura {detail.numero}</h3></div>
                <button className="btn ghost" onClick={() => setDetail(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="summary-grid">
                  <div><strong>Numero</strong><div className="mono">{detail.numero}</div></div>
                  <div><strong>Data</strong><div>{fmtDate(detail.data)}</div></div>
                  <div><strong>Cliente</strong><div>{detail.cliente || "-"}</div></div>
                  <div><strong>Pagamento</strong><div>{payLabel(detail.pagamento)}</div></div>
                  <div><strong>Stato</strong><div><span className={`tag ${detail.stato === "SALDATA" ? "success" : "warn"}`}>{detail.stato === "SALDATA" ? "Saldata" : "Da saldare"}</span></div></div>
                  <div><strong>Ordine rif.</strong><div>{detail.riferimentoOrdine || "-"}</div></div>
                  <div><strong>Totale fattura</strong><div style={{ fontWeight: 800, fontSize: 18 }}>{money(detail.totaleFattura)}</div></div>
                </div>
                {detail.lines && detail.lines.length > 0 && (
                  <>
                    <h4 style={{ margin: "16px 0 8px" }}>Prodotti</h4>
                    <div className="table" style={{ fontSize: 13 }}>
                      <div className="row header" style={{ gridTemplateColumns: "80px 1fr 50px 80px 80px 80px 90px" }}>
                        <div>SKU</div><div>Prodotto</div><div>Qtà</div><div>Unitario</div><div>Accisa</div><div>IVA</div><div>Totale</div>
                      </div>
                      {detail.lines.map((l, i) => (
                        <div className="row" key={i} style={{ gridTemplateColumns: "80px 1fr 50px 80px 80px 80px 90px" }}>
                          <div className="mono">{l.sku || "-"}</div>
                          <div>{l.productName || "-"}</div>
                          <div>{l.qty}</div>
                          <div>{money(l.unitGross)}</div>
                          <div>{money(l.exciseTotal)}</div>
                          <div>{money(l.vatTotal)}</div>
                          <div>{money(Number(l.unitGross) * Number(l.qty))}</div>
                        </div>
                      ))}
                    </div>
                    {(() => { const t = calcLineTotals(detail.lines); return (
                      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13 }}>
                        <span>Imponibile: <strong>{money(t.imponibile)}</strong></span>
                        <span>Accisa: <strong>{money(t.accisa)}</strong></span>
                        <span>IVA: <strong>{money(t.iva)}</strong></span>
                      </div>
                    ); })()}
                  </>
                )}
                <div className="actions" style={{ marginTop: 16 }}>
                  <button className="btn ghost" onClick={() => { togglePaid(detail); setDetail(null); }}>{detail.stato === "SALDATA" ? "Segna da saldare" : "Segna saldata"}</button>
                  <button className="btn ghost" onClick={() => { openEdit(detail); setDetail(null); }}>Modifica</button>
                  <button className="btn ghost" onClick={() => printInvoice(detail)}>Stampa</button>
                  <button className="btn ghost" onClick={() => printDDT(detail)}>DDT</button>
                  <button className="btn ghost" onClick={() => downloadPDF(detail)}>PDF</button>
                  <button className="btn ghost" onClick={() => sendInvoiceEmail(detail)} disabled={sendingEmail === detail.id}>{sendingEmail === detail.id ? "Invio..." : "Email"}</button>
                  <button className="btn ghost" onClick={() => exportSingleInvoice(detail)}>CSV</button>
                  <button className="btn ghost danger" onClick={() => deleteInvoice(detail)}>Elimina</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {editRow && editDraft && (
        <Portal>
          <div className="modal-backdrop" onClick={() => { setEditRow(null); setEditDraft(null); setEditLines([]); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
              <div className="modal-header">
                <h3>Modifica fattura {editRow.numero}</h3>
                <button className="btn ghost" onClick={() => { setEditRow(null); setEditDraft(null); setEditLines([]); }}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>Numero fattura<input value={editDraft.invoiceNumber} onChange={(e) => setEditDraft((p) => ({ ...p, invoiceNumber: e.target.value }))} /></label>
                  <label>Data<input type="date" value={editDraft.issuedAt} onChange={(e) => setEditDraft((p) => ({ ...p, issuedAt: e.target.value }))} /></label>
                </div>
                <LinesEditor lines={editLines} search={editSearch} setSearch={setEditSearch} results={editResults} onAdd={addEditLine} onUpdate={updateEditLine} onRemove={removeEditLine} />
                <div className="actions">
                  <button className="btn ghost" onClick={() => { setEditRow(null); setEditDraft(null); setEditLines([]); }}>Annulla</button>
                  <button className="btn primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Salvataggio..." : "Salva modifiche"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}

function LinesEditor({ lines, search, setSearch, results, onAdd, onUpdate, onRemove }) {
  const t = calcLineTotals(lines);
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 8px" }}>Prodotti</h4>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input placeholder="Cerca prodotto per nome o SKU..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%" }} />
        {results.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 50 }}>
            {results.map((p) => (
              <div key={p.id} onClick={() => onAdd(p)} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                <strong>{p.sku}</strong> — {p.name} — {money(p.price)}
              </div>
            ))}
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <div className="table" style={{ fontSize: 13 }}>
          <div className="row header" style={{ gridTemplateColumns: "80px 1fr 60px 80px 80px 80px 80px 40px" }}>
            <div>SKU</div><div>Prodotto</div><div>Qtà</div><div>Unitario</div><div>Accisa</div><div>IVA</div><div>Totale</div><div></div>
          </div>
          {lines.map((l, i) => (
            <div className="row" key={i} style={{ gridTemplateColumns: "80px 1fr 60px 80px 80px 80px 80px 40px" }}>
              <div className="mono">{l.sku || "-"}</div>
              <div>{l.productName || "-"}</div>
              <div><input type="number" min="1" value={l.qty} onChange={(e) => onUpdate(i, "qty", Number(e.target.value))} style={{ width: 50 }} /></div>
              <div><input type="number" step="0.01" value={l.unitGross} onChange={(e) => onUpdate(i, "unitGross", Number(e.target.value))} style={{ width: 70 }} /></div>
              <div><input type="number" step="0.01" value={l.exciseTotal} onChange={(e) => onUpdate(i, "exciseTotal", Number(e.target.value))} style={{ width: 70 }} /></div>
              <div><input type="number" step="0.01" value={l.vatTotal} onChange={(e) => onUpdate(i, "vatTotal", Number(e.target.value))} style={{ width: 70 }} /></div>
              <div>{money(Number(l.unitGross) * Number(l.qty))}</div>
              <div><button className="btn ghost small danger" onClick={() => onRemove(i)} style={{ padding: 2 }}>✕</button></div>
            </div>
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, fontWeight: 600 }}>
          <span>Imponibile: {money(t.imponibile)}</span>
          <span>Accisa: {money(t.accisa)}</span>
          <span>IVA: {money(t.iva)}</span>
          <span>Totale: {money(t.total)}</span>
        </div>
      )}
    </div>
  );
}
