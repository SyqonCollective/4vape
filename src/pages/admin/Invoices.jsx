import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";
import logoUrl from "../../assets/logo.png";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const LEGAL_COURTESY_NOTE =
  "Fattura di cortesia senza valenza fiscale. L'originale è disponibile nel tuo cassetto fiscale.";

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
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [manual, setManual] = useState({
    invoiceNumber: "",
    issuedAt: today,
    companyId: "",
    paymentMethod: "OTHER",
    imponibileProdotti: "",
    accisa: "",
    iva: "",
    costoProdotti: "",
  });

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
    if (!w) {
      setError("Popup bloccato: abilita i popup per stampare.");
      return;
    }
    w.document.write(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body{font-family:Arial,sans-serif;color:#0f172a;padding:22px}
            .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px}
            .logo{height:56px;object-fit:contain}
            .company{font-size:13px;line-height:1.45;text-align:right;color:#334155}
            h1{margin:0 0 8px;font-size:26px}
            .meta{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:0 0 14px}
            .meta .box{border:1px solid #cbd5e1;border-radius:9px;padding:8px 10px}
            .meta .k{font-size:11px;text-transform:uppercase;color:#64748b}
            .meta .v{font-weight:700;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin:14px 0}
            th,td{border:1px solid #cbd5e1;padding:8px 9px;text-align:left;font-size:13px}
            th{background:#f8fafc;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#475569}
            .right{text-align:right}
            .tot{margin-left:auto;max-width:340px;display:grid;gap:5px;margin-top:14px}
            .tot .r{display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding:4px 0}
            .tot .grand{font-weight:800;font-size:16px}
            .foot{margin-top:22px;color:#64748b;font-size:12px}
          </style>
        </head>
        <body>${htmlBody}<script>window.onload=()=>{window.print();window.close();};</script></body>
      </html>
    `);
    w.document.close();
  }

  function printInvoice(row) {
    const c = companyById.get(row.companyId);
    const clientAddress = [c?.address, c?.cap, c?.city, c?.province].filter(Boolean).join(", ") || "-";
    const body = `
      <div class="head">
        <img class="logo" src="${logoUrl}" alt="4Vape" />
        <div class="company">
          <strong>4Vape B2B</strong><br/>
          Documento fattura commerciale<br/>
          Data stampa: ${new Date().toLocaleString("it-IT")}
        </div>
      </div>
      <h1>Fattura ${row.numero || "-"}</h1>
      <div class="meta">
        <div class="box"><div class="k">Data</div><div class="v">${fmtDate(row.data)}</div></div>
        <div class="box"><div class="k">Stato</div><div class="v">${row.stato === "SALDATA" ? "Saldata" : "Da saldare"}</div></div>
        <div class="box"><div class="k">Pagamento</div><div class="v">${row.pagamento || "-"}</div></div>
        <div class="box"><div class="k">Ordine</div><div class="v">${row.riferimentoOrdine || "-"}</div></div>
      </div>
      <table>
        <thead><tr><th>Intestatario</th><th>P.IVA</th><th>Indirizzo</th></tr></thead>
        <tbody><tr><td>${row.cliente || "-"}</td><td>${c?.vatNumber || c?.adminVatNumber || "-"}</td><td>${clientAddress}</td></tr></tbody>
      </table>
      <table>
        <thead><tr><th>Voce</th><th class="right">Importo</th></tr></thead>
        <tbody>
          <tr><td>Imponibile prodotti</td><td class="right">${money(row.imponibileProdotti)}</td></tr>
          <tr><td>Accisa</td><td class="right">${money(row.accisa)}</td></tr>
          <tr><td>IVA</td><td class="right">${money(row.iva)}</td></tr>
        </tbody>
      </table>
      <div class="tot">
        <div class="r grand"><span>Totale fattura</span><span>${money(row.totaleFattura)}</span></div>
      </div>
      <div class="foot">
        ${LEGAL_COURTESY_NOTE}<br/>
        Generato da 4Vape B2B Admin.
      </div>
    `;
    openPrintDocument(`Fattura ${row.numero}`, body);
  }

  function printRegister() {
    const bodyRows = visibleRows
      .map(
        (r) => `<tr>
          <td>${r.numero || "-"}</td>
          <td>${fmtDate(r.data)}</td>
          <td>${r.cliente || "-"}</td>
          <td>${r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</td>
          <td>${r.pagamento || "-"}</td>
          <td class="right">${money(r.totaleFattura)}</td>
        </tr>`
      )
      .join("");
    const body = `
      <div class="head">
        <img class="logo" src="${logoUrl}" alt="4Vape" />
        <div class="company"><strong>Registro Fatture</strong><br/>Periodo: ${fmtDate(startDate)} - ${fmtDate(endDate)}</div>
      </div>
      <h1>Registro fatture</h1>
      <table>
        <thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Stato</th><th>Pagamento</th><th class="right">Totale</th></tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="6">Nessuna fattura nel filtro selezionato</td></tr>'}</tbody>
      </table>
      <div class="tot">
        <div class="r"><span>Totale fatture</span><span>${money(totals.total)}</span></div>
        <div class="r"><span>Imponibile</span><span>${money(totals.imponibile)}</span></div>
        <div class="r"><span>Accisa</span><span>${money(totals.accisa)}</span></div>
        <div class="r"><span>IVA</span><span>${money(totals.iva)}</span></div>
      </div>
      <div class="foot">${LEGAL_COURTESY_NOTE}</div>
    `;
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

  async function createManualInvoice() {
    try {
      setSavingManual(true);
      await api("/admin/invoices/manual", {
        method: "POST",
        body: JSON.stringify({
          invoiceNumber: manual.invoiceNumber,
          issuedAt: manual.issuedAt,
          companyId: manual.companyId,
          paymentMethod: manual.paymentMethod,
          imponibileProdotti: Number(manual.imponibileProdotti || 0),
          accisa: Number(manual.accisa || 0),
          iva: Number(manual.iva || 0),
          costoProdotti: Number(manual.costoProdotti || 0),
        }),
      });
      setShowManual(false);
      setManual({
        invoiceNumber: "",
        issuedAt: today,
        companyId: "",
        paymentMethod: "OTHER",
        imponibileProdotti: "",
        accisa: "",
        iva: "",
        costoProdotti: "",
      });
      await load();
    } catch {
      setError("Impossibile creare fattura manuale");
    } finally {
      setSavingManual(false);
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
          <div>Totale fattura</div>
          <div>Imponibile prodotti</div>
          <div>Accisa</div>
          <div>IVA</div>
          <div>Riferimento ordine</div>
          <div>Guadagno</div>
          <div>Azioni</div>
        </div>
        {visibleRows.map((r) => (
          <div className="row" key={r.id}>
            <div className="mono">{r.numero}</div>
            <div>{fmtDate(r.data)}</div>
            <div>{r.cliente || "-"}</div>
            <div><span className={`tag ${r.stato === "SALDATA" ? "success" : "warn"}`}>{r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</span></div>
            <div>{r.pagamento || "-"}</div>
            <div>{money(r.totaleFattura)}</div>
            <div>{money(r.imponibileProdotti)}</div>
            <div>{money(r.accisa)}</div>
            <div>{money(r.iva)}</div>
            <div>{r.riferimentoOrdine || "-"}</div>
            <div>{money(r.guadagno)}</div>
            <div className="actions">
              <button className="btn ghost small" onClick={() => togglePaid(r)}>
                {r.stato === "SALDATA" ? "Segna da saldare" : "Segna saldata"}
              </button>
              <button className="btn ghost small" onClick={() => exportSingleInvoice(r)}>Excel</button>
              <button className="btn ghost small" onClick={() => printInvoice(r)}>Stampa</button>
              <a
                className="btn ghost small"
                href={`mailto:?subject=Fattura%20${encodeURIComponent(r.numero)}&body=${encodeURIComponent(`Fattura ${r.numero} - Totale ${money(r.totaleFattura)}`)}`}
              >
                Invia mail
              </a>
            </div>
          </div>
        ))}
      </div>
      ) : (
        <div className="invoices-cards">
          {visibleRows.map((r) => (
            <article key={r.id} className="invoices-card">
              <div className="invoices-card-top">
                <strong className="mono">{r.numero}</strong>
                <span className={`tag ${r.stato === "SALDATA" ? "success" : "warn"}`}>{r.stato === "SALDATA" ? "Saldata" : "Da saldare"}</span>
              </div>
              <div><strong>{r.cliente || "-"}</strong></div>
              <div className="muted">{fmtDate(r.data)} · {r.pagamento || "-"}</div>
              <div className="invoices-card-totals">
                <span>{money(r.totaleFattura)}</span>
                <span>Ordine {r.riferimentoOrdine || "-"}</span>
              </div>
              <div className="actions">
                <button className="btn ghost small" onClick={() => togglePaid(r)}>
                  {r.stato === "SALDATA" ? "Da saldare" : "Saldata"}
                </button>
                <button className="btn ghost small" onClick={() => exportSingleInvoice(r)}>CSV</button>
                <button className="btn ghost small" onClick={() => printInvoice(r)}>Stampa</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showManual ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowManual(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Nuova fattura manuale</h3>
                <button className="btn ghost" onClick={() => setShowManual(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>Numero fattura<input value={manual.invoiceNumber} onChange={(e) => setManual((p) => ({ ...p, invoiceNumber: e.target.value }))} /></label>
                  <label>Data<input type="date" value={manual.issuedAt} onChange={(e) => setManual((p) => ({ ...p, issuedAt: e.target.value }))} /></label>
                  <label>Cliente<select className="select" value={manual.companyId} onChange={(e) => setManual((p) => ({ ...p, companyId: e.target.value }))}><option value="">Seleziona</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label>Pagamento<select className="select" value={manual.paymentMethod} onChange={(e) => setManual((p) => ({ ...p, paymentMethod: e.target.value }))}><option value="OTHER">Altro</option><option value="BANK_TRANSFER">Bonifico</option><option value="CARD">Carta</option><option value="COD">Contrassegno</option></select></label>
                  <label>Imponibile prodotti<input type="number" step="0.01" value={manual.imponibileProdotti} onChange={(e) => setManual((p) => ({ ...p, imponibileProdotti: e.target.value }))} /></label>
                  <label>Accisa<input type="number" step="0.01" value={manual.accisa} onChange={(e) => setManual((p) => ({ ...p, accisa: e.target.value }))} /></label>
                  <label>IVA<input type="number" step="0.01" value={manual.iva} onChange={(e) => setManual((p) => ({ ...p, iva: e.target.value }))} /></label>
                  <label>Costo prodotti<input type="number" step="0.01" value={manual.costoProdotti} onChange={(e) => setManual((p) => ({ ...p, costoProdotti: e.target.value }))} /></label>
                </div>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowManual(false)}>Annulla</button>
                  <button className="btn primary" onClick={createManualInvoice} disabled={savingManual}>{savingManual ? "Salvataggio..." : "Crea fattura"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </section>
  );
}
