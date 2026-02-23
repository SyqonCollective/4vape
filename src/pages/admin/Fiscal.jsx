import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
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

export default function AdminFiscal() {
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [selectedFortnightKey, setSelectedFortnightKey] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState({
    filters: {},
    totals: {
      orders: 0,
      qty: 0,
      imponibile: 0,
      accisa: 0,
      iva: 0,
      totale: 0,
      marginNet: 0,
    },
    customerSummary: [],
    quindicinaliAccisa: [],
    lines: [],
  });

  async function load() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);
      if (companyId) params.set("companyId", companyId);
      const res = await api(`/admin/fiscal/overview${params.toString() ? `?${params.toString()}` : ""}`);
      setData(res || {});
    } catch {
      setError("Impossibile caricare gestione fiscale");
    }
  }

  useEffect(() => {
    load();
  }, [startDate, endDate, companyId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/admin/companies");
        setCompanies((res || []).filter((c) => c.status === "ACTIVE"));
      } catch {
        // noop
      }
    })();
  }, []);

  const quindicinali = useMemo(
    () =>
      (data.quindicinaliAccisa || []).map((r) => ({
        ...r,
        periodLabel: `${new Date(r.periodStart).toLocaleDateString("it-IT")} - ${new Date(r.periodEnd).toLocaleDateString("it-IT")}`,
      })),
    [data.quindicinaliAccisa]
  );

  useEffect(() => {
    if (!quindicinali.length) {
      setSelectedFortnightKey("");
      return;
    }
    if (!selectedFortnightKey || !quindicinali.some((q) => q.key === selectedFortnightKey)) {
      setSelectedFortnightKey(quindicinali[0].key);
    }
  }, [quindicinali, selectedFortnightKey]);

  const selectedFortnight = useMemo(
    () => quindicinali.find((x) => x.key === selectedFortnightKey) || null,
    [quindicinali, selectedFortnightKey]
  );

  const selectedFortnightLines = useMemo(() => {
    if (!selectedFortnight) return [];
    const from = new Date(selectedFortnight.periodStart).getTime();
    const to = new Date(selectedFortnight.periodEnd).getTime();
    return (data.lines || []).filter((line) => {
      const ts = new Date(line.date).getTime();
      return ts >= from && ts <= to;
    });
  }, [data.lines, selectedFortnight]);

  const fortTotals = useMemo(
    () =>
      selectedFortnightLines.reduce(
        (acc, row) => {
          acc.qty += Number(row.qty || 0);
          acc.imponibile += Number(row.imponibile || 0);
          acc.accisa += Number(row.accisa || 0);
          acc.iva += Number(row.iva || 0);
          acc.totale += Number(row.totale || 0);
          return acc;
        },
        { qty: 0, imponibile: 0, accisa: 0, iva: 0, totale: 0 }
      ),
    [selectedFortnightLines]
  );

  function exportQuindicineSummary() {
    const headers = ["Periodo", "Ordini", "Quantita", "Imponibile", "Accisa", "IVA", "Totale"];
    const rows = quindicinali.map((r) => [
      r.periodLabel,
      r.orders,
      r.qty,
      Number(r.imponibile || 0).toFixed(2),
      Number(r.accisa || 0).toFixed(2),
      Number(r.iva || 0).toFixed(2),
      Number(r.totale || 0).toFixed(2),
    ]);
    exportCsv("fiscale_quindicinali_riepilogo.csv", headers, rows);
  }

  function exportQuindicinaDettaglio() {
    const label = selectedFortnight?.key || "periodo";
    const headers = [
      "Data ordine",
      "Numero ordine",
      "Cliente",
      "Partita IVA cliente",
      "Indirizzo cliente",
      "SKU",
      "Codice PL",
      "Prodotto",
      "ML prodotto",
      "Nicotina",
      "Qta",
      "Accisa unitaria",
      "Accisa totale",
      "Aliquota IVA",
      "IVA",
      "Imponibile",
      "Totale",
      "Fornitore",
    ];
    const rows = selectedFortnightLines.map((r) => [
      new Date(r.date).toLocaleDateString("it-IT"),
      r.orderNumber || "",
      r.customerName || "",
      r.customerVat || "",
      r.customerAddress || "",
      r.sku || "",
      r.codicePl || "",
      r.productName || "",
      Number(r.mlProduct || 0).toFixed(3),
      Number(r.nicotine || 0).toFixed(3),
      r.qty || 0,
      Number(r.exciseUnit || 0).toFixed(6),
      Number(r.accisa || 0).toFixed(2),
      Number(r.vatRate || 0).toFixed(2),
      Number(r.iva || 0).toFixed(2),
      Number(r.imponibile || 0).toFixed(2),
      Number(r.totale || 0).toFixed(2),
      r.supplierName || "",
    ]);
    exportCsv(`fiscale_quindicina_${label}.csv`, headers, rows);
  }

  function exportClientiSummary() {
    const headers = [
      "Cliente",
      "Partita IVA",
      "Ordini",
      "Quantita",
      "Imponibile",
      "Accisa",
      "IVA",
      "Totale",
      "Margine netto",
    ];
    const rows = (data.customerSummary || []).map((r) => [
      r.name || "",
      r.vatNumber || "",
      r.orders || 0,
      r.qty || 0,
      Number(r.imponibile || 0).toFixed(2),
      Number(r.accisa || 0).toFixed(2),
      Number(r.iva || 0).toFixed(2),
      Number(r.totale || 0).toFixed(2),
      Number(r.marginNet || 0).toFixed(2),
    ]);
    exportCsv("fiscale_clienti_storico.csv", headers, rows);
  }

  function exportDettaglioCompleto() {
    const headers = [
      "Data ordine",
      "Numero ordine",
      "Cliente",
      "Partita IVA cliente",
      "SKU",
      "Codice PL",
      "Prodotto",
      "ML prodotto",
      "Nicotina",
      "Qta",
      "Imponibile",
      "Accisa",
      "IVA",
      "Totale",
      "Fornitore",
    ];
    const rows = (data.lines || []).map((r) => [
      new Date(r.date).toLocaleDateString("it-IT"),
      r.orderNumber || "",
      r.customerName || "",
      r.customerVat || "",
      r.sku || "",
      r.codicePl || "",
      r.productName || "",
      Number(r.mlProduct || 0).toFixed(3),
      Number(r.nicotine || 0).toFixed(3),
      r.qty || 0,
      Number(r.imponibile || 0).toFixed(2),
      Number(r.accisa || 0).toFixed(2),
      Number(r.iva || 0).toFixed(2),
      Number(r.totale || 0).toFixed(2),
      r.supplierName || "",
    ]);
    exportCsv("fiscale_dettaglio_completo.csv", headers, rows);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Gestione fiscale</h1>
          <p>Quindicine accise, storico clienti e dettaglio fiscale vendite</p>
        </div>
      </div>
      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel fiscal-toolbar">
        <div className="filters-row">
          <div className="filter-group"><label>Data dal</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="filter-group"><label>Data al</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="filter-group" style={{ minWidth: 320 }}>
            <label>Cliente</label>
            <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="actions"><button className="btn ghost" onClick={load}>Aggiorna</button></div>
        </div>
      </div>

      <div className="cards">
        <div className="card"><div className="card-label">Ordini fiscali</div><div className="card-value">{data.totals?.orders || 0}</div></div>
        <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(data.totals?.imponibile)}</div></div>
        <div className="card"><div className="card-label">Accisa</div><div className="card-value">{money(data.totals?.accisa)}</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{money(data.totals?.iva)}</div></div>
        <div className="card"><div className="card-label">Totale lordo</div><div className="card-value">{money(data.totals?.totale)}</div></div>
        <div className="card"><div className="card-label">Margine netto</div><div className="card-value">{money(data.totals?.marginNet)}</div></div>
      </div>

      <div className="panel fiscal-section">
        <div className="page-header">
          <div>
            <h3>Sezione 1 · Quindicine Accise</h3>
            <p>Riepilogo periodi 1-15 e 16-fine mese con export CSV</p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={exportQuindicineSummary}>Esporta riepilogo CSV</button>
          </div>
        </div>
        <div className="table">
          <div className="row header">
            <div>Periodo</div>
            <div>Ordini</div>
            <div>Q.tà</div>
            <div>Imponibile</div>
            <div>Accisa</div>
            <div>IVA</div>
            <div>Totale</div>
          </div>
          {quindicinali.map((r) => (
            <div
              className={`row clickable ${selectedFortnightKey === r.key ? "selected" : ""}`}
              key={r.key}
              onClick={() => setSelectedFortnightKey(r.key)}
            >
              <div>{r.periodLabel}</div>
              <div>{r.orders}</div>
              <div>{r.qty}</div>
              <div>{money(r.imponibile)}</div>
              <div>{money(r.accisa)}</div>
              <div>{money(r.iva)}</div>
              <div>{money(r.totale)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel fiscal-section" style={{ marginTop: 14 }}>
        <div className="page-header">
          <div>
            <h3>Sezione 2 · Dettaglio Quindicina Selezionata</h3>
            <p>{selectedFortnight?.periodLabel || "Seleziona una quindicina sopra"}</p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={exportQuindicinaDettaglio} disabled={!selectedFortnight}>
              Esporta dettaglio quindicina CSV
            </button>
          </div>
        </div>
        <div className="cards">
          <div className="card"><div className="card-label">Q.tà</div><div className="card-value">{fortTotals.qty}</div></div>
          <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(fortTotals.imponibile)}</div></div>
          <div className="card"><div className="card-label">Accisa</div><div className="card-value">{money(fortTotals.accisa)}</div></div>
          <div className="card"><div className="card-label">IVA</div><div className="card-value">{money(fortTotals.iva)}</div></div>
          <div className="card"><div className="card-label">Totale</div><div className="card-value">{money(fortTotals.totale)}</div></div>
        </div>
        <div className="table wide-report">
          <div className="row header">
            <div>Data</div>
            <div>Ordine</div>
            <div>Cliente</div>
            <div>SKU</div>
            <div>Prodotto</div>
            <div>Q.tà</div>
            <div>Imponibile</div>
            <div>Accisa</div>
            <div>IVA</div>
            <div>Totale</div>
          </div>
          {selectedFortnightLines.map((r) => (
            <div className="row" key={`${r.orderId}-${r.sku}-${r.date}`}>
              <div>{new Date(r.date).toLocaleDateString("it-IT")}</div>
              <div className="mono">{r.orderNumber || "-"}</div>
              <div title={r.customerAddress || ""}>{r.customerName}</div>
              <div className="mono">{r.sku}</div>
              <div title={`${r.productName || ""} | PL: ${r.codicePl || "-"}`}>{r.productName}</div>
              <div>{r.qty}</div>
              <div>{money(r.imponibile)}</div>
              <div>{money(r.accisa)}</div>
              <div>{money(r.iva)}</div>
              <div>{money(r.totale)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel fiscal-section" style={{ marginTop: 14 }}>
        <div className="page-header">
          <div>
            <h3>Sezione 3 · Report Clienti Storico</h3>
            <p>Totali per cliente nel periodo selezionato</p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={exportClientiSummary}>Esporta clienti CSV</button>
          </div>
        </div>
        <div className="table">
          <div className="row header">
            <div>Cliente</div>
            <div>Partita IVA</div>
            <div>Ordini</div>
            <div>Imponibile</div>
            <div>Accisa</div>
            <div>IVA</div>
            <div>Totale</div>
            <div>Margine netto</div>
          </div>
          {(data.customerSummary || []).map((r) => (
            <div className="row" key={r.companyId}>
              <div>{r.name}</div>
              <div>{r.vatNumber || "-"}</div>
              <div>{r.orders}</div>
              <div>{money(r.imponibile)}</div>
              <div>{money(r.accisa)}</div>
              <div>{money(r.iva)}</div>
              <div>{money(r.totale)}</div>
              <div>{money(r.marginNet)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel fiscal-section" style={{ marginTop: 14 }}>
        <div className="page-header">
          <div>
            <h3>Sezione 4 · Dettaglio Completo Vendite Fiscali</h3>
            <p>Tutte le righe di vendita del periodo, esportabili CSV</p>
          </div>
          <div className="actions">
            <button className="btn ghost" onClick={exportDettaglioCompleto}>Esporta dettaglio completo CSV</button>
          </div>
        </div>
        <div className="table wide-report">
          <div className="row header">
            <div>Data</div>
            <div>Ordine</div>
            <div>Cliente</div>
            <div>SKU</div>
            <div>Prodotto</div>
            <div>Q.tà</div>
            <div>Imponibile</div>
            <div>Accisa</div>
            <div>IVA</div>
            <div>Totale</div>
          </div>
          {(data.lines || []).map((r) => (
            <div className="row" key={`${r.orderId}-${r.sku}-${r.date}`}>
              <div>{new Date(r.date).toLocaleDateString("it-IT")}</div>
              <div className="mono">{r.orderNumber || "-"}</div>
              <div>{r.customerName}</div>
              <div className="mono">{r.sku}</div>
              <div>{r.productName}</div>
              <div>{r.qty}</div>
              <div>{money(r.imponibile)}</div>
              <div>{money(r.accisa)}</div>
              <div>{money(r.iva)}</div>
              <div>{money(r.totale)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

