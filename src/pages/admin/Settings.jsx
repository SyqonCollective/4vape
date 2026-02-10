import { useEffect, useState } from "react";
import InlineError from "../../components/InlineError.jsx";
import { api } from "../../lib/api.js";

export default function AdminSettings() {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [excises, setExcises] = useState([]);
  const [newTax, setNewTax] = useState({ name: "", rate: "" });
  const [newExcise, setNewExcise] = useState({ name: "", type: "ML", amount: "" });
  const [editingExciseId, setEditingExciseId] = useState("");
  const [editingExcise, setEditingExcise] = useState({ name: "", type: "ML", amount: "" });
  const [form, setForm] = useState({
    vatRateDefault: "",
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [res, taxRes, exciseRes] = await Promise.all([
          api("/admin/settings"),
          api("/admin/taxes"),
          api("/admin/excises"),
        ]);
        if (!active) return;
        setForm({
          vatRateDefault: res?.vatRateDefault ?? "",
        });
        setTaxes(taxRes || []);
        setExcises(exciseRes || []);
      } catch {
        setError("Impossibile caricare le impostazioni");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          vatRateDefault: form.vatRateDefault === "" ? undefined : Number(form.vatRateDefault),
        }),
      });
    } catch {
      setError("Errore salvataggio impostazioni");
    } finally {
      setSaving(false);
    }
  }

  async function addTax() {
    if (!newTax.name.trim() || newTax.rate === "") return;
    try {
      const res = await api("/admin/taxes", {
        method: "POST",
        body: JSON.stringify({ name: newTax.name.trim(), rate: Number(newTax.rate) }),
      });
      setTaxes((prev) => [...prev, res]);
      setNewTax({ name: "", rate: "" });
    } catch {
      setError("Errore creazione IVA");
    }
  }

  async function addExcise() {
    if (!newExcise.name.trim() || newExcise.amount === "") return;
    try {
      const res = await api("/admin/excises", {
        method: "POST",
        body: JSON.stringify({
          name: newExcise.name.trim(),
          type: newExcise.type,
          amount: Number(newExcise.amount),
        }),
      });
      setExcises((prev) => [...prev, res]);
      setNewExcise({ name: "", type: "ML", amount: "" });
    } catch {
      setError("Errore creazione accisa");
    }
  }

  async function deleteTax(id) {
    try {
      await api(`/admin/taxes/${id}`, { method: "DELETE" });
      setTaxes((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("Errore eliminazione IVA");
    }
  }

  async function deleteExcise(id) {
    try {
      await api(`/admin/excises/${id}`, { method: "DELETE" });
      setExcises((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Errore eliminazione accisa");
    }
  }

  async function saveExcise() {
    if (!editingExciseId) return;
    try {
      const payload = {
        name: editingExcise.name.trim(),
        type: editingExcise.type,
        amount: Number(editingExcise.amount),
      };
      const res = await api(`/admin/excises/${editingExciseId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setExcises((prev) => prev.map((e) => (e.id === editingExciseId ? res : e)));
      setEditingExciseId("");
    } catch {
      setError("Errore modifica accisa");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Impostazioni</h1>
          <p>Imposta i valori fiscali disponibili per il catalogo</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel">
        <div className="form-grid">
          <label>
            IVA default (%)
            <select
              className="select"
              value={form.vatRateDefault}
              onChange={(e) => setForm({ ...form, vatRateDefault: e.target.value })}
            >
              <option value="">Seleziona IVA di default</option>
              {taxes.map((t) => (
                <option key={t.id} value={Number(t.rate).toFixed(2)}>
                  {t.name} ({Number(t.rate).toFixed(2)}%)
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Aliquote IVA</h3>
        <div className="form-grid">
          <label>
            Nome
            <input value={newTax.name} onChange={(e) => setNewTax({ ...newTax, name: e.target.value })} />
          </label>
          <label>
            Aliquota %
            <input
              type="number"
              step="0.01"
              value={newTax.rate}
              onChange={(e) => setNewTax({ ...newTax, rate: e.target.value })}
            />
          </label>
          <div className="actions">
            <button className="btn primary" onClick={addTax}>Aggiungi IVA</button>
          </div>
        </div>
        <div className="table">
          <div className="row header">
            <div>Nome</div>
            <div>Aliquota</div>
            <div>Azioni</div>
          </div>
          {taxes.map((t) => (
            <div className="row" key={t.id}>
              <div>{t.name}</div>
              <div>{Number(t.rate).toFixed(2)}%</div>
              <div className="actions">
                <button className="btn danger" onClick={() => deleteTax(t.id)}>Elimina</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Accise</h3>
        <div className="form-grid">
          <label>
            Nome
            <input value={newExcise.name} onChange={(e) => setNewExcise({ ...newExcise, name: e.target.value })} />
          </label>
          <label>
            Tipo
            <select value={newExcise.type} onChange={(e) => setNewExcise({ ...newExcise, type: e.target.value })}>
              <option value="ML">Per ML</option>
              <option value="PRODUCT">Per prodotto</option>
            </select>
          </label>
          <label>
            Importo
            <input
              type="number"
              step="0.000001"
              value={newExcise.amount}
              onChange={(e) => setNewExcise({ ...newExcise, amount: e.target.value })}
            />
          </label>
          <div className="actions">
            <button className="btn primary" onClick={addExcise}>Aggiungi accisa</button>
          </div>
        </div>
        <div className="table">
          <div className="row header">
            <div>Nome</div>
            <div>Tipo</div>
            <div>Importo</div>
            <div>Azioni</div>
          </div>
          {excises.map((e) => (
            <div className="row" key={e.id}>
              {editingExciseId === e.id ? (
                <>
                  <div>
                    <input
                      value={editingExcise.name}
                      onChange={(ev) => setEditingExcise({ ...editingExcise, name: ev.target.value })}
                    />
                  </div>
                  <div>
                    <select
                      value={editingExcise.type}
                      onChange={(ev) => setEditingExcise({ ...editingExcise, type: ev.target.value })}
                    >
                      <option value="ML">Per ML</option>
                      <option value="PRODUCT">Per prodotto</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.000001"
                      value={editingExcise.amount}
                      onChange={(ev) => setEditingExcise({ ...editingExcise, amount: ev.target.value })}
                    />
                  </div>
                  <div className="actions">
                    <button className="btn ghost" onClick={() => setEditingExciseId("")}>Annulla</button>
                    <button className="btn primary" onClick={saveExcise}>Salva</button>
                  </div>
                </>
              ) : (
                <>
                  <div>{e.name}</div>
                  <div>{e.type === "ML" ? "Per ML" : "Per prodotto"}</div>
                  <div>{Number(e.amount).toFixed(6)}</div>
                  <div className="actions">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setEditingExciseId(e.id);
                        setEditingExcise({
                          name: e.name,
                          type: e.type,
                          amount: Number(e.amount).toFixed(6),
                        });
                      }}
                    >
                      Modifica
                    </button>
                    <button className="btn danger" onClick={() => deleteExcise(e.id)}>Elimina</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
