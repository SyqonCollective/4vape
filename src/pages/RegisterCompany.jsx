import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { api } from "../lib/api.js";

const PROVINCES = [
  "AG", "AL", "AN", "AO", "AP", "AQ", "AR", "AT", "AV", "BA", "BG", "BI", "BL", "BN", "BO", "BR",
  "BS", "BT", "BZ", "CA", "CB", "CE", "CH", "CL", "CN", "CO", "CR", "CS", "CT", "CZ", "EN", "FC",
  "FE", "FG", "FI", "FM", "FR", "GE", "GO", "GR", "IM", "IS", "KR", "LC", "LE", "LI", "LO", "LT",
  "LU", "MB", "MC", "ME", "MI", "MN", "MO", "MS", "MT", "NA", "NO", "NU", "OR", "PA", "PC", "PD",
  "PE", "PG", "PI", "PN", "PO", "PR", "PT", "PU", "PV", "PZ", "RA", "RC", "RE", "RG", "RI", "RN",
  "RO", "SA", "SI", "SO", "SP", "SR", "SS", "SU", "SV", "TA", "TE", "TN", "TO", "TP", "TR", "TS",
  "TV", "UD", "VA", "VB", "VC", "VE", "VI", "VR", "VS", "VT",
];

export default function RegisterCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    contactFirstName: "",
    contactLastName: "",
    legalName: "",
    vatNumber: "",
    sdiCode: "",
    address: "",
    cap: "",
    city: "",
    province: "",
    phone: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSuccess(true);
      setTimeout(() => navigate("/admin/login"), 1600);
    } catch (err) {
      setError("Impossibile inviare la richiesta. Controlla i dati.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap register-page">
      <div className="register-layout">
        <aside className="register-hero">
          <div className="register-hero-inner">
            <img src={logo} alt="4Vape B2B" className="register-logo" />
            <span className="register-badge">Accesso B2B</span>
            <h1>Iscrizione nuova azienda</h1>
            <p>
              Compila i dati dell&apos;azienda e del referente. La tua richiesta verrà verificata
              dal team commerciale prima dell&apos;abilitazione.
            </p>
            <div className="register-highlight">
              <div>
                <strong>Verifica rapida</strong>
                <span>Riceverai conferma via email.</span>
              </div>
              <div>
                <strong>Listini dedicati</strong>
                <span>Prezzi B2B e condizioni personalizzate.</span>
              </div>
              <div>
                <strong>Assistenza dedicata</strong>
                <span>Supporto commerciale prioritario.</span>
              </div>
            </div>
          </div>
          <div className="register-hero-gradient" />
        </aside>

        <div className="register-card">
          <div className="register-header">
            <div>
              <h2>Richiesta di accesso</h2>
              <p>Tutti i campi sono obbligatori</p>
            </div>
            <button type="button" className="btn ghost" onClick={() => navigate("/admin/login")}>
              Torna al login
            </button>
          </div>

          <form onSubmit={onSubmit} className="register-form">
            <div className="form-section">
              <div className="section-title">Referente</div>
              <div className="form-grid">
                <label>
                  Nome
                  <input value={form.contactFirstName} onChange={(e) => updateField("contactFirstName", e.target.value)} required />
                </label>
                <label>
                  Cognome
                  <input value={form.contactLastName} onChange={(e) => updateField("contactLastName", e.target.value)} required />
                </label>
                <label className="full">
                  Email
                  <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
                </label>
                <label>
                  Telefono
                  <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required />
                </label>
                <label>
                  Password
                  <input type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} required minLength={8} />
                </label>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">Azienda</div>
              <div className="form-grid">
                <label className="full">
                  Ragione sociale
                  <input value={form.legalName} onChange={(e) => updateField("legalName", e.target.value)} required />
                </label>
                <label>
                  Partita IVA
                  <input value={form.vatNumber} onChange={(e) => updateField("vatNumber", e.target.value)} required />
                </label>
                <label>
                  Codice univoco SDI
                  <input value={form.sdiCode} onChange={(e) => updateField("sdiCode", e.target.value)} required />
                </label>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">Sede legale</div>
              <div className="form-grid">
                <label className="full">
                  Indirizzo
                  <input value={form.address} onChange={(e) => updateField("address", e.target.value)} required />
                </label>
                <label>
                  CAP
                  <input value={form.cap} onChange={(e) => updateField("cap", e.target.value)} required />
                </label>
                <label>
                  Città
                  <input value={form.city} onChange={(e) => updateField("city", e.target.value)} required />
                </label>
                <label>
                  Provincia
                  <input
                    list="province-list"
                    value={form.province}
                    onChange={(e) => updateField("province", e.target.value.toUpperCase())}
                    required
                  />
                  <datalist id="province-list">
                    {PROVINCES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </label>
              </div>
            </div>

            {error ? <div className="error">{error}</div> : null}
            {success ? <div className="success-banner">Richiesta inviata. Attendi approvazione.</div> : null}

            <div className="register-actions">
              <button className="btn primary" disabled={loading}>
                {loading ? "Invio..." : "Invia richiesta"}
              </button>
              <span className="register-note">Riceverai una mail di conferma.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
