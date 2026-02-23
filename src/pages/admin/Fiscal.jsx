import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const money = (v) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

export default function AdminFiscal() {
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState({
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
    () => (data.quindicinaliAccisa || []).map((r) => ({
      ...r,
      periodLabel: `${new Date(r.periodStart).toLocaleDateString("it-IT")} - ${new Date(r.periodEnd).toLocaleDateString("it-IT")}`,
    })),
    [data.quindicinaliAccisa]
  );

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Gestione fiscale</h1>
          <p>Controllo vendite ADM: clienti, accise quindicinali, IVA e storico per periodo</p>
        </div>
      </div>
      <InlineError message={error} onClose={() => setError("")} />

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

      <div className="cards">
        <div className="card"><div className="card-label">Ordini fiscali</div><div className="card-value">{data.totals?.orders || 0}</div></div>
        <div className="card"><div className="card-label">Imponibile</div><div className="card-value">{money(data.totals?.imponibile)}</div></div>
        <div className="card"><div className="card-label">Accisa</div><div className="card-value">{money(data.totals?.accisa)}</div></div>
        <div className="card"><div className="card-label">IVA</div><div className="card-value">{money(data.totals?.iva)}</div></div>
        <div className="card"><div className="card-label">Totale lordo</div><div className="card-value">{money(data.totals?.totale)}</div></div>
        <div className="card"><div className="card-label">Margine netto</div><div className="card-value">{money(data.totals?.marginNet)}</div></div>
      </div>

      <div className="panel">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div><h3>Quindicina accise</h3><p>Prospetto 1-15 / 16-fine mese (controllo interno)</p></div>
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
            <div className="row" key={r.key}>
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

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div><h3>Report clienti storico</h3><p>A chi hai venduto, quanto, imposte e margine netto</p></div>
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

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <div><h3>Dettaglio vendite fiscali</h3><p>Cliente, prodotto, fornitore, accise e IVA per riga</p></div>
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
              <div title={r.customerAddress || ""}>{r.customerName}</div>
              <div className="mono">{r.sku}</div>
              <div title={r.supplierName || ""}>{r.productName}</div>
              <div>{r.qty}</div>
              <div>{money(r.imponibile)}</div>
              <div>{money(r.accisa)}</div>
              <div>{money(r.iva)}</div>
              <div>{money(r.totale)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          Nota: questo pannello è uno strumento gestionale interno. Per gli adempimenti fiscali ufficiali ADM/AdE
          resta necessario il controllo del consulente fiscale.
        </p>
      </div>
    </section>
  );
}

