import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminUsers() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
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
      const res = await api("/admin/users/pending");
      setItems(res);
      const companyRes = await api("/admin/companies");
      setCompanies(companyRes || []);
    } catch (err) {
      setError("Impossibile caricare utenti");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id) {
    try {
      await api(`/admin/users/${id}/approve`, { method: "PATCH" });
      load();
    } catch (err) {
      setError("Errore approvazione utente");
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
    } catch (err) {
      setError("Errore creazione azienda");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Utenti</h1>
          <p>Approva nuovi account B2B</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setShowCompanyModal(true)}>
            Crea azienda
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="table">
        <div className="row header">
          <div>Email</div>
          <div>Ruolo</div>
          <div>Azioni</div>
        </div>
        {items.map((u) => (
          <div className="row" key={u.id}>
            <div>{u.email}</div>
            <div>{u.role}</div>
            <div>
              <button className="btn primary" onClick={() => approve(u.id)}>
                Approva
              </button>
            </div>
          </div>
        ))}
      </div>

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
    </section>
  );
}
