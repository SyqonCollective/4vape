import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

// CHECKLIST (admin richieste):
// [x] Click riga cliente apre scheda/modifica

export default function AdminCompanies() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showCompanyEdit, setShowCompanyEdit] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [pendingDetails, setPendingDetails] = useState(null);
  const [confirmRejectUser, setConfirmRejectUser] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [sdiCode, setSdiCode] = useState("");
  const [address, setAddress] = useState("");
  const [cap, setCap] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [pec, setPec] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [cmnr, setCmnr] = useState("");
  const [signNumber, setSignNumber] = useState("");
  const [adminVatNumber, setAdminVatNumber] = useState("");
  const [groupName, setGroupName] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState("table");
  const [showPending, setShowPending] = useState(true);
  const GROUP_OPTIONS = ["NEGOZIO", "TABACCHERIA"];

  async function load() {
    try {
      const [pendingRes, companyRes] = await Promise.all([
        api("/admin/users/pending"),
        api("/admin/companies"),
      ]);
      setPendingUsers(pendingRes || []);
      setCompanies(companyRes || []);
    } catch {
      setError("Impossibile caricare aziende");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleCompanies = useMemo(() => {
    let list = [...companies];
    if (statusFilter !== "all") {
      list = list.filter((c) => String(c.status || "").toUpperCase() === statusFilter);
    }
    const q = companySearch.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        [
          c.name,
          c.legalName,
          c.vatNumber,
          c.email,
          c.customerCode,
          c.contactFirstName,
          c.contactLastName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [companies, companySearch, statusFilter]);

  const companyStats = useMemo(() => {
    const active = companies.filter((c) => c.status === "ACTIVE").length;
    const pending = companies.filter((c) => c.status === "PENDING").length;
    const suspended = companies.filter((c) => c.status === "SUSPENDED").length;
    return { total: companies.length, active, pending, suspended };
  }, [companies]);

  function formatMoney(value) {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("it-IT");
  }

  function exportCompaniesCsv() {
    const headers = ["Ragione sociale", "P.IVA", "Gruppo", "Referente", "Email", "Stato", "Ordini", "Fatturato"];
    const rows = visibleCompanies.map((c) => [
      c.legalName || c.name || "",
      c.vatNumber || "",
      c.groupName || "",
      `${c.contactFirstName || ""} ${c.contactLastName || ""}`.trim(),
      c.email || "",
      c.status || "",
      c?.stats?.orders ?? 0,
      Number(c?.stats?.revenue ?? 0).toFixed(2),
    ]);
    const esc = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clienti_aziende_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function approveUser(id) {
    try {
      await api(`/admin/users/${id}/approve`, { method: "PATCH" });
      load();
    } catch {
      setError("Errore approvazione richiesta");
    }
  }

  async function rejectUser(id) {
    try {
      await api(`/admin/users/${id}/reject`, { method: "DELETE" });
      load();
    } catch {
      setError("Errore rifiuto richiesta");
    }
  }

  function openPendingDetails(user) {
    setPendingDetails(user);
    setShowPendingDetails(true);
  }

  function openEditCompany(company) {
    setEditingCompany({ ...company });
    setShowCompanyEdit(true);
  }

  async function saveCompany() {
    if (!editingCompany) return;
    try {
      const payload = {
        name: editingCompany.name || "",
        vatNumber: editingCompany.vatNumber || null,
        contactFirstName: editingCompany.contactFirstName || null,
        contactLastName: editingCompany.contactLastName || null,
        legalName: editingCompany.legalName || null,
        sdiCode: editingCompany.sdiCode || null,
        address: editingCompany.address || null,
        cap: editingCompany.cap || null,
        city: editingCompany.city || null,
        province: editingCompany.province || null,
        phone: editingCompany.phone || null,
        email: editingCompany.email || null,
        customerCode: editingCompany.customerCode || null,
        pec: editingCompany.pec || null,
        licenseNumber: editingCompany.licenseNumber || null,
        cmnr: editingCompany.cmnr || null,
        signNumber: editingCompany.signNumber || null,
        adminVatNumber: editingCompany.adminVatNumber || null,
        groupName: editingCompany.groupName || null,
        status: editingCompany.status || "ACTIVE",
      };
      await api(`/admin/companies/${editingCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setShowCompanyEdit(false);
      setEditingCompany(null);
      load();
    } catch {
      setError("Errore salvataggio azienda");
    }
  }

  async function toggleCompany(status) {
    if (!editingCompany) return;
    try {
      await api(`/admin/companies/${editingCompany.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setEditingCompany({ ...editingCompany, status });
      load();
    } catch {
      setError("Errore aggiornamento stato");
    }
  }

  async function deleteCompany() {
    if (!editingCompany) return;
    try {
      await api(`/admin/companies/${editingCompany.id}`, { method: "DELETE" });
      setShowCompanyEdit(false);
      setEditingCompany(null);
      load();
    } catch {
      setError("Impossibile eliminare azienda (ha ordini?)");
    }
  }

  async function createCompany() {
    if (
      !companyName.trim() ||
      !vatNumber.trim() ||
      !contactFirstName.trim() ||
      !contactLastName.trim() ||
      !legalName.trim() ||
      !sdiCode.trim() ||
      !address.trim() ||
      !cap.trim() ||
      !city.trim() ||
      !province.trim() ||
      !phone.trim() ||
      !email.trim()
    ) {
      setError("Compila tutti i campi obbligatori");
      return;
    }
    try {
      await api("/admin/companies", {
        method: "POST",
        body: JSON.stringify({
          name: companyName.trim(),
          vatNumber: vatNumber.trim(),
          contactFirstName: contactFirstName.trim(),
          contactLastName: contactLastName.trim(),
          legalName: legalName.trim(),
          sdiCode: sdiCode.trim(),
          address: address.trim(),
          cap: cap.trim(),
          city: city.trim(),
          province: province.trim(),
          phone: phone.trim(),
          email: email.trim(),
          customerCode: customerCode.trim() || undefined,
          pec: pec.trim() || undefined,
          licenseNumber: licenseNumber.trim() || undefined,
          cmnr: cmnr.trim() || undefined,
          signNumber: signNumber.trim() || undefined,
          adminVatNumber: adminVatNumber.trim() || undefined,
          groupName: groupName.trim() || undefined,
          status: "ACTIVE",
        }),
      });
      setCompanyName("");
      setVatNumber("");
      setContactFirstName("");
      setContactLastName("");
      setLegalName("");
      setSdiCode("");
      setAddress("");
      setCap("");
      setCity("");
      setProvince("");
      setPhone("");
      setEmail("");
      setCustomerCode("");
      setPec("");
      setLicenseNumber("");
      setCmnr("");
      setSignNumber("");
      setAdminVatNumber("");
      setGroupName("");
      setShowCompanyModal(false);
      load();
    } catch {
      setError("Errore creazione azienda");
    }
  }

  return (
    <section className="companies-page">
      <div className="page-header">
        <div>
          <h1>Clienti / Aziende</h1>
          <p>Gestisci aziende B2B e richieste di accesso</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowCompanyModal(true)}>
            Crea azienda
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards companies-cards">
        <div className="card">
          <div className="card-label">Aziende totali</div>
          <div className="card-value">{companyStats.total}</div>
        </div>
        <div className="card">
          <div className="card-label">Attive</div>
          <div className="card-value">{companyStats.active}</div>
        </div>
        <div className="card">
          <div className="card-label">In attesa</div>
          <div className="card-value">{companyStats.pending}</div>
        </div>
        <div className="card">
          <div className="card-label">Revocate</div>
          <div className="card-value">{companyStats.suspended}</div>
        </div>
      </div>

      <div className="panel companies-pending-panel">
        <div className="panel-header-compact">
          <h3>Richieste in attesa</h3>
          <button className="btn ghost" onClick={() => setShowPending((v) => !v)}>
            {showPending ? "Minimizza" : `Espandi (${pendingUsers.length})`}
          </button>
        </div>
        {showPending ? (
        <div className="table">
          <div className="row header">
            <div>Email</div>
            <div>Ruolo</div>
            <div>Azioni</div>
          </div>
          {pendingUsers.length === 0 ? (
            <div className="row">
              <div className="muted">Nessuna richiesta</div>
              <div />
              <div />
            </div>
          ) : (
            pendingUsers.map((u) => (
              <div className="row" key={u.id}>
                <div>{u.email}</div>
                <div>{u.role}</div>
                <div>
                  <button className="btn ghost" onClick={() => openPendingDetails(u)}>
                    Vedi dettagli
                  </button>
                  <button className="btn primary" onClick={() => approveUser(u.id)}>
                    Approva
                  </button>
                  <button className="btn danger" onClick={() => setConfirmRejectUser(u)}>
                    Rifiuta
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-header-compact">
          <h3>Aziende</h3>
          <button className="btn ghost" onClick={exportCompaniesCsv}>Export</button>
        </div>
        <div className="companies-filters-shell">
          <div className="companies-filters-top">
            <input
              placeholder="Cerca cliente (nome, P.IVA, email...)"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
            />
            <div className="products-view-switch">
              <button type="button" className={`btn ${viewMode === "table" ? "primary" : "ghost"}`} onClick={() => setViewMode("table")}>Tabella</button>
              <button type="button" className={`btn ${viewMode === "cards" ? "primary" : "ghost"}`} onClick={() => setViewMode("cards")}>Card</button>
            </div>
            <button className="btn ghost" onClick={() => {
              setCompanySearch("");
              setStatusFilter("all");
            }}>Reset</button>
          </div>
          <div className="filters-row companies-filters-grid">
            <div className="filter-group">
              <label>Stato</label>
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tutti</option>
                <option value="ACTIVE">Attivi</option>
                <option value="PENDING">In attesa</option>
                <option value="SUSPENDED">Revocati</option>
              </select>
            </div>
          </div>
        </div>
        {viewMode === "table" ? (
          <div className="table companies-table companies-table-pro">
            <div className="row header">
              <div>Ragione sociale</div>
              <div>P.IVA</div>
              <div>Gruppo</div>
              <div>Referente</div>
              <div>Email</div>
              <div>Ultimo accesso</div>
              <div>Registrazione</div>
              <div>Ordini</div>
              <div>Fatturato</div>
              <div>Media ordini</div>
              <div>Stato</div>
            </div>
            {visibleCompanies.length === 0 ? (
              <div className="row">
                <div className="muted">Nessuna azienda presente</div>
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
              </div>
            ) : (
              visibleCompanies.map((c) => (
                <div className="row" key={c.id} onClick={() => openEditCompany(c)} style={{ cursor: "pointer" }}>
                  <div>{c.legalName || c.name}</div>
                  <div>{c.vatNumber || "—"}</div>
                  <div>{c.groupName || "—"}</div>
                  <div>
                    {(c.contactFirstName || "") + " " + (c.contactLastName || "")}
                  </div>
                  <div>{c.email || "—"}</div>
                  <div>{formatDate(c?.stats?.lastAccessAt)}</div>
                  <div>{formatDate(c?.stats?.registeredAt || c.createdAt)}</div>
                  <div>{c?.stats?.orders ?? 0}</div>
                  <div>{formatMoney(c?.stats?.revenue ?? 0)}</div>
                  <div>{formatMoney(c?.stats?.averageOrderValue ?? 0)}</div>
                  <div className="actions">
                    <span
                      className={`tag ${
                        c.status === "SUSPENDED" ? "danger" : c.status === "PENDING" ? "warn" : "success"
                      }`}
                    >
                      {c.status === "SUSPENDED"
                        ? "Revocata"
                        : c.status === "PENDING"
                        ? "In attesa"
                        : "Attivo"}
                    </span>
                    <button
                      className="btn ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditCompany(c);
                      }}
                    >
                      Modifica
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="companies-cards-grid">
            {visibleCompanies.map((c) => (
              <article className="companies-card" key={c.id}>
                <div className="companies-card-top">
                  <h4>{c.legalName || c.name}</h4>
                  <span
                    className={`tag ${
                      c.status === "SUSPENDED" ? "danger" : c.status === "PENDING" ? "warn" : "success"
                    }`}
                  >
                    {c.status === "SUSPENDED"
                      ? "Revocata"
                      : c.status === "PENDING"
                      ? "In attesa"
                      : "Attivo"}
                  </span>
                </div>
                <div className="muted">P.IVA: {c.vatNumber || "—"}</div>
                <div className="muted">Gruppo: {c.groupName || "—"}</div>
                <div className="muted">Referente: {(c.contactFirstName || "") + " " + (c.contactLastName || "")}</div>
                <div className="muted">Email: {c.email || "—"}</div>
                <div className="companies-card-grid">
                  <span>Ordini: <strong>{c?.stats?.orders ?? 0}</strong></span>
                  <span>Fatturato: <strong>{formatMoney(c?.stats?.revenue ?? 0)}</strong></span>
                  <span>Media: <strong>{formatMoney(c?.stats?.averageOrderValue ?? 0)}</strong></span>
                </div>
                <button className="btn ghost" onClick={() => openEditCompany(c)}>Modifica azienda</button>
              </article>
            ))}
            {!visibleCompanies.length ? <div className="inventory-empty">Nessuna azienda presente</div> : null}
          </div>
        )}
      </div>

      {showPendingDetails && pendingDetails ? (
        <div className="modal-backdrop" onClick={() => setShowPendingDetails(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Dettagli richiesta</div>
                <div className="modal-subtitle">{pendingDetails.email}</div>
              </div>
              <button className="btn ghost" onClick={() => setShowPendingDetails(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body modal-body-single">
              <div className="rules-grid">
                <label>
                  Ragione sociale
                  <input value={pendingDetails.company?.legalName || ""} disabled />
                </label>
                <label>
                  Partita IVA
                  <input value={pendingDetails.company?.vatNumber || ""} disabled />
                </label>
                <label>
                  Referente
                  <input
                    value={`${pendingDetails.company?.contactFirstName || ""} ${pendingDetails.company?.contactLastName || ""}`}
                    disabled
                  />
                </label>
                <label>
                  SDI
                  <input value={pendingDetails.company?.sdiCode || ""} disabled />
                </label>
                <label>
                  Indirizzo
                  <input value={pendingDetails.company?.address || ""} disabled />
                </label>
                <label>
                  CAP
                  <input value={pendingDetails.company?.cap || ""} disabled />
                </label>
                <label>
                  Città
                  <input value={pendingDetails.company?.city || ""} disabled />
                </label>
                <label>
                  Provincia
                  <input value={pendingDetails.company?.province || ""} disabled />
                </label>
                <label>
                  Telefono
                  <input value={pendingDetails.company?.phone || ""} disabled />
                </label>
                <label>
                  Email azienda
                  <input value={pendingDetails.company?.email || ""} disabled />
                </label>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setShowPendingDetails(false)}>
                  Chiudi
                </button>
                <button className="btn primary" onClick={() => approveUser(pendingDetails.id)}>
                  Approva
                </button>
                <button className="btn danger" onClick={() => setConfirmRejectUser(pendingDetails)}>
                  Rifiuta
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRejectUser ? (
        <div className="modal-backdrop" onClick={() => setConfirmRejectUser(null)}>
          <div className="modal modal-compact" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Rifiuta richiesta</div>
                <div className="modal-subtitle">
                  Sei sicuro di voler rifiutare questa richiesta?
                </div>
              </div>
              <button className="btn ghost" onClick={() => setConfirmRejectUser(null)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body modal-body-single">
              <div className="actions">
                <button className="btn ghost" onClick={() => setConfirmRejectUser(null)}>
                  Annulla
                </button>
                <button
                  className="btn danger"
                  onClick={async () => {
                    const id = confirmRejectUser.id;
                    setConfirmRejectUser(null);
                    await rejectUser(id);
                  }}
                >
                  Rifiuta
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCompanyModal ? (
        <div className="modal-backdrop" onClick={() => setShowCompanyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Crea azienda</div>
                <div className="modal-subtitle">Inserisci i dati principali</div>
              </div>
              <button className="btn ghost" onClick={() => setShowCompanyModal(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body modal-body-single">
              <div className="rules-grid">
                <label>
                  Nome azienda
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </label>
                <label>
                  Ragione sociale
                  <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </label>
                <label>
                  Nome referente
                  <input value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} />
                </label>
                <label>
                  Cognome referente
                  <input value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} />
                </label>
                <label>
                  Partita IVA
                  <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                </label>
                <label>
                  Codice univoco SDI
                  <input value={sdiCode} onChange={(e) => setSdiCode(e.target.value)} />
                </label>
                <label>
                  Indirizzo
                  <input value={address} onChange={(e) => setAddress(e.target.value)} />
                </label>
                <label>
                  CAP
                  <input value={cap} onChange={(e) => setCap(e.target.value)} />
                </label>
                <label>
                  Città
                  <input value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
                <label>
                  Provincia
                  <input value={province} onChange={(e) => setProvince(e.target.value)} />
                </label>
                <label>
                  Telefono
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label>
                  Email
                  <input value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  Gruppo cliente
                  <select className="select" value={groupName} onChange={(e) => setGroupName(e.target.value)}>
                    <option value="">Seleziona</option>
                    {GROUP_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Codice cliente (opzionale)
                  <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} />
                </label>
                <label>
                  PEC (opzionale)
                  <input value={pec} onChange={(e) => setPec(e.target.value)} />
                </label>
                <label>
                  Numero esercizio (opzionale)
                  <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                </label>
                <label>
                  CMNR (opzionale)
                  <input value={cmnr} onChange={(e) => setCmnr(e.target.value)} />
                </label>
                <label>
                  Numero insegna (opzionale)
                  <input value={signNumber} onChange={(e) => setSignNumber(e.target.value)} />
                </label>
                <label>
                  CF/P.IVA ADM (opzionale)
                  <input value={adminVatNumber} onChange={(e) => setAdminVatNumber(e.target.value)} />
                </label>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setShowCompanyModal(false)}>
                  Annulla
                </button>
                <button className="btn primary" onClick={createCompany}>
                  Crea
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCompanyEdit && editingCompany ? (
        <div className="modal-backdrop" onClick={() => setShowCompanyEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Modifica azienda</div>
                <div className="modal-subtitle">{editingCompany.legalName || editingCompany.name}</div>
              </div>
              <button className="btn ghost" onClick={() => setShowCompanyEdit(false)}>
                Chiudi
              </button>
            </div>
            <div className="modal-body modal-body-single">
              <div className="rules-grid">
                <label>
                  Nome azienda
                  <input value={editingCompany.name || ""} onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })} />
                </label>
                <label>
                  Ragione sociale
                  <input value={editingCompany.legalName || ""} onChange={(e) => setEditingCompany({ ...editingCompany, legalName: e.target.value })} />
                </label>
                <label>
                  Nome referente
                  <input value={editingCompany.contactFirstName || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contactFirstName: e.target.value })} />
                </label>
                <label>
                  Cognome referente
                  <input value={editingCompany.contactLastName || ""} onChange={(e) => setEditingCompany({ ...editingCompany, contactLastName: e.target.value })} />
                </label>
                <label>
                  Partita IVA
                  <input value={editingCompany.vatNumber || ""} onChange={(e) => setEditingCompany({ ...editingCompany, vatNumber: e.target.value })} />
                </label>
                <label>
                  Codice univoco SDI
                  <input value={editingCompany.sdiCode || ""} onChange={(e) => setEditingCompany({ ...editingCompany, sdiCode: e.target.value })} />
                </label>
                <label>
                  Indirizzo
                  <input value={editingCompany.address || ""} onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })} />
                </label>
                <label>
                  CAP
                  <input value={editingCompany.cap || ""} onChange={(e) => setEditingCompany({ ...editingCompany, cap: e.target.value })} />
                </label>
                <label>
                  Città
                  <input value={editingCompany.city || ""} onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })} />
                </label>
                <label>
                  Provincia
                  <input value={editingCompany.province || ""} onChange={(e) => setEditingCompany({ ...editingCompany, province: e.target.value })} />
                </label>
                <label>
                  Telefono
                  <input value={editingCompany.phone || ""} onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })} />
                </label>
                <label>
                  Email
                  <input value={editingCompany.email || ""} onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })} />
                </label>
                <label>
                  Gruppo cliente
                  <select className="select" value={editingCompany.groupName || ""} onChange={(e) => setEditingCompany({ ...editingCompany, groupName: e.target.value })}>
                    <option value="">Seleziona</option>
                    {GROUP_OPTIONS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Codice cliente
                  <input value={editingCompany.customerCode || ""} onChange={(e) => setEditingCompany({ ...editingCompany, customerCode: e.target.value })} />
                </label>
                <label>
                  PEC
                  <input value={editingCompany.pec || ""} onChange={(e) => setEditingCompany({ ...editingCompany, pec: e.target.value })} />
                </label>
                <label>
                  Numero esercizio
                  <input value={editingCompany.licenseNumber || ""} onChange={(e) => setEditingCompany({ ...editingCompany, licenseNumber: e.target.value })} />
                </label>
                <label>
                  CMNR
                  <input value={editingCompany.cmnr || ""} onChange={(e) => setEditingCompany({ ...editingCompany, cmnr: e.target.value })} />
                </label>
                <label>
                  Numero insegna
                  <input value={editingCompany.signNumber || ""} onChange={(e) => setEditingCompany({ ...editingCompany, signNumber: e.target.value })} />
                </label>
                <label>
                  CF/P.IVA ADM
                  <input value={editingCompany.adminVatNumber || ""} onChange={(e) => setEditingCompany({ ...editingCompany, adminVatNumber: e.target.value })} />
                </label>
              </div>
              <div className="actions">
                {editingCompany.status === "SUSPENDED" ? (
                  <button className="btn ghost" onClick={() => toggleCompany("ACTIVE")}>
                    Ripristina accesso
                  </button>
                ) : (
                  <button className="btn ghost" onClick={() => toggleCompany("SUSPENDED")}>
                    Revoca accesso
                  </button>
                )}
                <button className="btn danger" onClick={deleteCompany}>
                  Elimina
                </button>
                <button className="btn primary" onClick={saveCompany}>
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
