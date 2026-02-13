import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export default function ReturnsTest() {
  const [orderNumber, setOrderNumber] = useState("");
  const [productName, setProductName] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [contactName, setContactName] = useState("Mario Rossi");
  const [contactEmail, setContactEmail] = useState("cliente@test.it");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult("");
    setError("");
    try {
      const form = new FormData();
      form.append("orderNumber", orderNumber);
      form.append("productName", productName);
      form.append("problemDescription", problemDescription);
      form.append("contactName", contactName);
      form.append("contactEmail", contactEmail);
      files.forEach((f) => form.append("images", f));

      const res = await fetch(`${API_BASE}/returns/request`, {
        method: "POST",
        body: form,
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || "Errore invio richiesta");
      setResult("Richiesta reso inviata correttamente");
      setOrderNumber("");
      setProductName("");
      setProblemDescription("");
      setFiles([]);
    } catch (err) {
      setError(err.message || "Errore invio richiesta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell" style={{ minHeight: "100vh", padding: "28px 14px" }}>
      <form className="register-card" onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        <h1>Test richiesta reso</h1>
        <p>Pagina di test per simulare invio da area privata cliente.</p>

        <label>Numero ordine</label>
        <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />

        <label>Prodotto (nome)</label>
        <input value={productName} onChange={(e) => setProductName(e.target.value)} required />

        <label>Descrizione problema</label>
        <textarea
          className="goods-paste"
          value={problemDescription}
          onChange={(e) => setProblemDescription(e.target.value)}
          required
        />

        <label>Nome cliente (test)</label>
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} />

        <label>Email cliente (test)</label>
        <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />

        <label>Immagini</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />

        {error ? <div className="error-banner">{error}</div> : null}
        {result ? <div className="success-banner">{result}</div> : null}

        <button className="btn primary" disabled={loading}>
          {loading ? "Invio..." : "Invia richiesta reso"}
        </button>
      </form>
    </div>
  );
}
