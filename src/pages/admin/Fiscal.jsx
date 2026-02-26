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
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
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
  const [success, setSuccess] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [activeSection, setActiveSection] = useState("quindicinale");
  const [quindicinaleView, setQuindicinaleView] = useState("table");
  const [mensileView, setMensileView] = useState("table");
  const [quindicinaleQuery, setQuindicinaleQuery] = useState("");
  const [mensileQuery, setMensileQuery] = useState("");
  const [data, setData] = useState({
    filters: {},
    quindicinale: { cards: {}, rows: [] },
    mensile: { cards: {}, rows: [] },
  });

  async function load() {
    try {
      setError("");
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

  async function syncFromOrders() {
    try {
      setError("");
      setSuccess("");
      setSyncing(true);
      const payload = {
        start: startDate || undefined,
        end: endDate || undefined,
        companyId: companyId || undefined,
      };
      const res = await api("/admin/fiscal/sync-from-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess(
        `Sincronizzazione completata: ${res?.invoicesUpserted || 0} fatture, ${res?.linesWritten || 0} righe.`
      );
      await load();
    } catch {
      setError("Sincronizzazione fatture fiscali fallita");
    } finally {
      setSyncing(false);
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

  const quindicinaleRows = useMemo(() => data?.quindicinale?.rows || [], [data]);
  const mensileRows = useMemo(() => data?.mensile?.rows || [], [data]);

  const filteredQuindicinaleRows = useMemo(() => {
    const query = quindicinaleQuery.trim().toLowerCase();
    if (!query) return quindicinaleRows;
    return quindicinaleRows.filter((r) =>
      [r.sku, r.prodotto, r.codicePl]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [quindicinaleRows, quindicinaleQuery]);

  const filteredMensileRows = useMemo(() => {
    const query = mensileQuery.trim().toLowerCase();
    if (!query) return mensileRows;
    return mensileRows.filter((r) =>
      [
        r.ragioneSociale,
        r.prodotto,
        r.codicePl,
        r.cfPivaAdm,
        r.cmnr,
        r.numeroInsegna,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [mensileRows, mensileQuery]);

  function exportQuindicinale() {
    const headers = [
      "SKU",
      "Prodotto",
      "Codice PL",
      "ML prodotto",
      "Nicotina",
      "Prezzo medio vendita ivato",
      "Quantita",
      "Accisa",
    ];
    const rows = quindicinaleRows.map((r) => [
      r.sku || "",
      r.prodotto || "",
      r.codicePl || "",
      Number(r.mlProduct || 0).toFixed(3),
      Number(r.nicotine || 0).toFixed(3),
      Number(r.avgPriceIvato || 0).toFixed(2),
      Number(r.qty || 0),
      Number(r.accisa || 0).toFixed(6),
    ]);
    exportCsv("gestione_fiscale_quindicinale.csv", headers, rows);
  }

  function exportMensile() {
    const headers = [
      "Numero esercizio",
      "CMNR",
      "Numero insegna",
      "Ragione sociale",
      "Comune",
      "Provincia",
      "CF/P.IVA ADM",
      "Prodotto",
      "Codice PL",
      "ML prodotto",
      "Nicotina",
      "Quantita",
    ];
    const rows = mensileRows.map((r) => [
      r.numeroEsercizio || "",
      r.cmnr || "",
      r.numeroInsegna || "",
      r.ragioneSociale || "",
      r.comune || "",
      r.provincia || "",
      r.cfPivaAdm || "",
      r.prodotto || "",
      r.codicePl || "",
      Number(r.mlProduct || 0).toFixed(3),
      Number(r.nicotine || 0).toFixed(3),
      Number(r.qty || 0),
    ]);
    exportCsv("gestione_fiscale_mensile.csv", headers, rows);
  }

  return (
    <section className="fiscal-page">
      <div className="page-header">
        <div>
          <h1>Gestione fiscale</h1>
          <p>Monitoraggio fiscale operativo per quindicinale e mensile con export dedicati</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />
      {success ? <div className="success-banner">{success}</div> : null}

      <div className="fiscal-toolbar-shell">
        <div className="fiscal-toolbar-top">
          <div className="products-view-switch">
            <button
              type="button"
              className={`btn ${activeSection === "quindicinale" ? "primary" : "ghost"}`}
              onClick={() => setActiveSection("quindicinale")}
            >
              Sezione 1 · Quindicinale
            </button>
            <button
              type="button"
              className={`btn ${activeSection === "mensile" ? "primary" : "ghost"}`}
              onClick={() => setActiveSection("mensile")}
            >
              Sezione 2 · Mensile
            </button>
          </div>
          <div className="actions fiscal-toolbar-actions">
            <button className="btn ghost" onClick={load}>Aggiorna dati</button>
            <button className="btn primary" onClick={syncFromOrders} disabled={syncing}>
              {syncing ? "Sincronizzo..." : "Sincronizza da fatture fiscali"}
            </button>
          </div>
        </div>
        <div className="filters-row fiscal-toolbar-grid">
          <div className="filter-group">
            <label>Data dal</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Data al</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Cliente</label>
            <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Range attivo</label>
            <div className="fiscal-range-chip">
              {(startDate || "Inizio")} → {(endDate || "Oggi")}
            </div>
          </div>
        </div>
      </div>

      {activeSection === "quindicinale" ? (
        <div className="panel fiscal-section">
          <div className="fiscal-section-head">
            <div>
              <h3>SEZIONE 1 · Quindicinale</h3>
              <p>Righe aggregate per SKU (somma quantità su SKU uguali, prezzo medio ivato senza accisa)</p>
            </div>
            <div className="actions">
              <input
                className="fiscal-search"
                value={quindicinaleQuery}
                onChange={(e) => setQuindicinaleQuery(e.target.value)}
                placeholder="Cerca SKU, prodotto, codice PL"
              />
              <div className="products-view-switch">
                <button type="button" className={`btn ${quindicinaleView === "table" ? "primary" : "ghost"}`} onClick={() => setQuindicinaleView("table")}>Tabella</button>
                <button type="button" className={`btn ${quindicinaleView === "cards" ? "primary" : "ghost"}`} onClick={() => setQuindicinaleView("cards")}>Card</button>
              </div>
              <button className="btn ghost" onClick={exportQuindicinale}>Esporta CSV</button>
            </div>
          </div>
          <div className="cards fiscal-cards">
            <div className="card"><div className="card-label">Fatture fiscali</div><div className="card-value">{data?.quindicinale?.cards?.fiscalInvoices || 0}</div></div>
            <div className="card"><div className="card-label">Prodotti venduti</div><div className="card-value">{data?.quindicinale?.cards?.productsSold || 0}</div></div>
            <div className="card"><div className="card-label">Quantità vendute</div><div className="card-value">{data?.quindicinale?.cards?.totalQty || 0}</div></div>
            <div className="card"><div className="card-label">Accisa totale</div><div className="card-value">{money(data?.quindicinale?.cards?.totalAccisa || 0)}</div></div>
          </div>
          {quindicinaleView === "table" ? (
            <div className="table fiscal-table-pro">
              <div className="row header">
                <div>SKU</div>
                <div>Prodotto</div>
                <div>Codice PL</div>
                <div>ML prodotto</div>
                <div>Nicotina</div>
                <div>Prezzo medio vendita ivato</div>
                <div>Quantità</div>
                <div>Accisa (categoria)</div>
              </div>
              {filteredQuindicinaleRows.map((r, idx) => (
                <div className="row" key={`${r.sku}-${idx}`}>
                  <div className="mono">{r.sku || "-"}</div>
                  <div>{r.prodotto || "-"}</div>
                  <div>{r.codicePl || "-"}</div>
                  <div>{Number(r.mlProduct || 0).toFixed(3)}</div>
                  <div>{Number(r.nicotine || 0).toFixed(3)}</div>
                  <div>{money(r.avgPriceIvato || 0)}</div>
                  <div>{Number(r.qty || 0)}</div>
                  <div>{Number(r.accisa || 0).toFixed(6)}</div>
                </div>
              ))}
              {!filteredQuindicinaleRows.length ? <div className="inventory-empty">Nessun dato nel periodo selezionato</div> : null}
            </div>
          ) : (
            <div className="fiscal-cards-grid">
              {filteredQuindicinaleRows.map((r, idx) => (
                <article className="fiscal-row-card" key={`${r.sku}-${idx}`}>
                  <div className="fiscal-row-card-top">
                    <strong className="mono">{r.sku || "-"}</strong>
                    <span className="tag info">{r.codicePl || "-"}</span>
                  </div>
                  <h4>{r.prodotto || "-"}</h4>
                  <div className="fiscal-row-grid">
                    <span>ML: <strong>{Number(r.mlProduct || 0).toFixed(3)}</strong></span>
                    <span>Nicotina: <strong>{Number(r.nicotine || 0).toFixed(3)}</strong></span>
                    <span>Prezzo medio: <strong>{money(r.avgPriceIvato || 0)}</strong></span>
                    <span>Quantità: <strong>{Number(r.qty || 0)}</strong></span>
                    <span>Accisa: <strong>{Number(r.accisa || 0).toFixed(6)}</strong></span>
                  </div>
                </article>
              ))}
              {!filteredQuindicinaleRows.length ? <div className="inventory-empty">Nessun dato nel periodo selezionato</div> : null}
            </div>
          )}
        </div>
      ) : null}

      {activeSection === "mensile" ? (
        <div className="panel fiscal-section" style={{ marginTop: 14 }}>
          <div className="fiscal-section-head">
            <div>
              <h3>SEZIONE 2 · Mensile</h3>
              <p>Righe aggregate per cliente + SKU (somma quantità su SKU uguali per cliente)</p>
            </div>
            <div className="actions">
              <input
                className="fiscal-search"
                value={mensileQuery}
                onChange={(e) => setMensileQuery(e.target.value)}
                placeholder="Cerca cliente, prodotto, codice PL, CF/P.IVA ADM"
              />
              <div className="products-view-switch">
                <button type="button" className={`btn ${mensileView === "table" ? "primary" : "ghost"}`} onClick={() => setMensileView("table")}>Tabella</button>
                <button type="button" className={`btn ${mensileView === "cards" ? "primary" : "ghost"}`} onClick={() => setMensileView("cards")}>Card</button>
              </div>
              <button className="btn ghost" onClick={exportMensile}>Esporta CSV</button>
            </div>
          </div>
          <div className="cards fiscal-cards">
            <div className="card"><div className="card-label">Fatture fiscali</div><div className="card-value">{data?.mensile?.cards?.fiscalInvoices || 0}</div></div>
            <div className="card"><div className="card-label">Prodotti venduti</div><div className="card-value">{data?.mensile?.cards?.productsSold || 0}</div></div>
            <div className="card"><div className="card-label">Quantità vendute</div><div className="card-value">{data?.mensile?.cards?.totalQty || 0}</div></div>
            <div className="card"><div className="card-label">Litri venduti</div><div className="card-value">{Number(data?.mensile?.cards?.litersSold || 0).toFixed(3)} L</div></div>
          </div>
          {mensileView === "table" ? (
            <div className="table fiscal-table-pro fiscal-table-pro-monthly">
              <div className="row header">
                <div>N. esercizio</div>
                <div>CMNR</div>
                <div>N. insegna</div>
                <div>Ragione sociale</div>
                <div>Comune</div>
                <div>Provincia</div>
                <div>CF/P.IVA ADM</div>
                <div>Prodotto</div>
                <div>Codice PL</div>
                <div>ML prodotto</div>
                <div>Nicotina</div>
                <div>Quantità</div>
              </div>
              {filteredMensileRows.map((r, idx) => (
                <div className="row" key={`${r.cfPivaAdm}-${r.codicePl}-${idx}`}>
                  <div>{r.numeroEsercizio || "-"}</div>
                  <div>{r.cmnr || "-"}</div>
                  <div>{r.numeroInsegna || "-"}</div>
                  <div>{r.ragioneSociale || "-"}</div>
                  <div>{r.comune || "-"}</div>
                  <div>{r.provincia || "-"}</div>
                  <div>{r.cfPivaAdm || "-"}</div>
                  <div>{r.prodotto || "-"}</div>
                  <div>{r.codicePl || "-"}</div>
                  <div>{Number(r.mlProduct || 0).toFixed(3)}</div>
                  <div>{Number(r.nicotine || 0).toFixed(3)}</div>
                  <div>{Number(r.qty || 0)}</div>
                </div>
              ))}
              {!filteredMensileRows.length ? <div className="inventory-empty">Nessun dato nel periodo selezionato</div> : null}
            </div>
          ) : (
            <div className="fiscal-cards-grid">
              {filteredMensileRows.map((r, idx) => (
                <article className="fiscal-row-card" key={`${r.cfPivaAdm}-${r.codicePl}-${idx}`}>
                  <div className="fiscal-row-card-top">
                    <strong>{r.ragioneSociale || "-"}</strong>
                    <span className="tag info">{r.codicePl || "-"}</span>
                  </div>
                  <div className="muted">{r.prodotto || "-"}</div>
                  <div className="fiscal-row-grid">
                    <span>N. esercizio: <strong>{r.numeroEsercizio || "-"}</strong></span>
                    <span>CMNR: <strong>{r.cmnr || "-"}</strong></span>
                    <span>N. insegna: <strong>{r.numeroInsegna || "-"}</strong></span>
                    <span>Comune: <strong>{r.comune || "-"}</strong></span>
                    <span>Provincia: <strong>{r.provincia || "-"}</strong></span>
                    <span>CF/P.IVA ADM: <strong>{r.cfPivaAdm || "-"}</strong></span>
                    <span>ML: <strong>{Number(r.mlProduct || 0).toFixed(3)}</strong></span>
                    <span>Nicotina: <strong>{Number(r.nicotine || 0).toFixed(3)}</strong></span>
                    <span>Quantità: <strong>{Number(r.qty || 0)}</strong></span>
                  </div>
                </article>
              ))}
              {!filteredMensileRows.length ? <div className="inventory-empty">Nessun dato nel periodo selezionato</div> : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
