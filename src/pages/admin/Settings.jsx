import { useEffect, useState } from "react";
import InlineError from "../../components/InlineError.jsx";
import { api } from "../../lib/api.js";

export default function AdminSettings() {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vatRateDefault: "",
    exciseMlDefault: "",
    exciseProductDefault: "",
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/admin/settings");
        if (!active) return;
        setForm({
          vatRateDefault: res?.vatRateDefault ?? "",
          exciseMlDefault: res?.exciseMlDefault ?? "",
          exciseProductDefault: res?.exciseProductDefault ?? "",
        });
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
          exciseMlDefault: form.exciseMlDefault === "" ? undefined : Number(form.exciseMlDefault),
          exciseProductDefault:
            form.exciseProductDefault === "" ? undefined : Number(form.exciseProductDefault),
        }),
      });
    } catch {
      setError("Errore salvataggio impostazioni");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Impostazioni</h1>
          <p>Parametri fiscali di default per importazione</p>
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
            <input
              type="number"
              step="0.01"
              value={form.vatRateDefault}
              onChange={(e) => setForm({ ...form, vatRateDefault: e.target.value })}
              placeholder="22.00"
            />
          </label>
          <label>
            Accisa per ML (€)
            <input
              type="number"
              step="0.000001"
              value={form.exciseMlDefault}
              onChange={(e) => setForm({ ...form, exciseMlDefault: e.target.value })}
              placeholder="0.000000"
            />
          </label>
          <label>
            Accisa per Prodotto (€)
            <input
              type="number"
              step="0.000001"
              value={form.exciseProductDefault}
              onChange={(e) => setForm({ ...form, exciseProductDefault: e.target.value })}
              placeholder="0.000000"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
