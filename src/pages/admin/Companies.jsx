import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminCompanies() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showCompanyEdit, setShowCompanyEdit] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [pendingDetails, setPendingDetails] = useState(null);
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

  async function approveUser(id) {
    try {
      await api(`/admin/users/${id}/approve`, { method: "PATCH" });
      load();
    } catch {
      setError("Errore approvazione richiesta");
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
      setShowCompanyModal(false);
      load();
    } catch {
      setError("Errore creazione azienda");
    }
  }

  return (
    <section>
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

      <div className="panel">
        <h3>Richieste in attesa</h3>
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Aziende</h3>
        <div className="table">
          <div className="row header">
            <div>Ragione sociale</div>
            <div>P.IVA</div>
            <div>Referente</div>
            <div>Email</div>
            <div>Stato</div>
          </div>
          {companies.length === 0 ? (
            <div className="row">
              <div className="muted">Nessuna azienda presente</div>
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : (
            companies.map((c) => (
              <div className="row" key={c.id}>
                <div>{c.legalName || c.name}</div>
                <div>{c.vatNumber || "—"}</div>
                <div>
                  {(c.contactFirstName || "") + " " + (c.contactLastName || "")}
                </div>
                <div>{c.email || "—"}</div>
                <div className="actions">
                  <span className={`tag ${c.status === "SUSPENDED" ? "danger" : c.status === "PENDING" ? "warn" : "success"}`}>
                    {c.status || "—"}
                  </span>
                  <button className="btn ghost" onClick={() => openEditCompany(c)}>
                    Modifica
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
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
                <button className="btn ghost" onClick={() => toggleCompany("SUSPENDED")}>
                  Revoca accesso
                </button>
                <button className="btn ghost" onClick={() => toggleCompany("ACTIVE")}>
                  Ripristina accesso
                </button>
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
