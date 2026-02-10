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
    <div className="auth-wrap auth-epic register-page">
      <div className="auth-card register-card">
        <div className="auth-header">
          <img src={logo} alt="4Vape B2B" className="auth-logo" />
          <h1>Iscrizione nuova azienda</h1>
          <p>Compila tutti i campi per inviare la richiesta</p>
        </div>
        <form onSubmit={onSubmit} className="auth-form register-form">
          <div className="form-grid">
            <label>
              Nome referente
              <input value={form.contactFirstName} onChange={(e) => updateField("contactFirstName", e.target.value)} required />
            </label>
            <label>
              Cognome referente
              <input value={form.contactLastName} onChange={(e) => updateField("contactLastName", e.target.value)} required />
            </label>
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
              <input list="province-list" value={form.province} onChange={(e) => updateField("province", e.target.value.toUpperCase())} required />
              <datalist id="province-list">
                {PROVINCES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label>
              Telefono
              <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} required minLength={8} />
            </label>
          </div>
          {error ? <div className="error">{error}</div> : null}
          {success ? <div className="success-banner">Richiesta inviata. Attendi approvazione.</div> : null}
          <button className="btn primary" disabled={loading}>
            {loading ? "Invio..." : "Invia richiesta"}
          </button>
          <button type="button" className="btn ghost" onClick={() => navigate("/admin/login")}>
            Torna al login
          </button>
        </form>
      </div>
    </div>
  );
}
