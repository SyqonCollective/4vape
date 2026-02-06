import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function AdminSuppliers() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    csvFullUrl: "",
    csvStockUrl: "",
  });

  async function load() {
    try {
      const res = await api("/admin/suppliers");
      setItems(res);
    } catch (err) {
      setError("Impossibile caricare fornitori");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSupplier(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          csvFullUrl: form.csvFullUrl || undefined,
          csvStockUrl: form.csvStockUrl || undefined,
        }),
      });
      setForm({ name: "", code: "", csvFullUrl: "", csvStockUrl: "" });
      load();
    } catch (err) {
      setError("Errore creazione fornitore");
    }
  }

  async function importFull(id) {
    try {
      await api(`/admin/suppliers/${id}/import-full`, { method: "POST" });
      load();
    } catch (err) {
      setError("Errore import completo");
    }
  }

  async function updateStock(id) {
    try {
      await api(`/admin/suppliers/${id}/update-stock`, { method: "POST" });
      load();
    } catch (err) {
      setError("Errore aggiornamento giacenze");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Fornitori</h1>
          <p>Configura e importa prodotti dal fornitore</p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="panel">
        <h2>Nuovo fornitore</h2>
        <form className="form-grid" onSubmit={createSupplier}>
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Codice
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </label>
          <label>
            CSV Completo URL
            <input value={form.csvFullUrl} onChange={(e) => setForm({ ...form, csvFullUrl: e.target.value })} />
          </label>
          <label>
            CSV Giacenze URL
            <input value={form.csvStockUrl} onChange={(e) => setForm({ ...form, csvStockUrl: e.target.value })} />
          </label>
          <button className="btn primary">Crea</button>
        </form>
      </div>

      <div className="table">
        <div className="row header">
          <div>Nome</div>
          <div>Codice</div>
          <div>Azioni</div>
        </div>
        {items.map((s) => (
          <div className="row" key={s.id}>
            <div>{s.name}</div>
            <div className="mono">{s.code}</div>
            <div className="actions">
              <button className="btn" onClick={() => importFull(s.id)}>Import completo</button>
              <button className="btn ghost" onClick={() => updateStock(s.id)}>Aggiorna giacenze</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
