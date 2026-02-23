import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

const emptyDraft = {
  id: "",
  name: "",
  code: "",
  legalName: "",
  vatNumber: "",
  taxCode: "",
  sdiCode: "",
  pec: "",
  address: "",
  cap: "",
  city: "",
  province: "",
  country: "IT",
  phone: "",
  email: "",
};

function makeCode(name) {
  const slug = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 10);
  return `${(slug || "forn").toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

export default function AdminSupplierRegistry() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  async function load() {
    try {
      const res = await api("/admin/suppliers");
      setItems(res || []);
    } catch {
      setError("Impossibile caricare fornitori");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return items;
    return items.filter((s) =>
      [
        s.name,
        s.code,
        s.legalName,
        s.vatNumber,
        s.taxCode,
        s.email,
        s.city,
      ]
        .join(" ")
        .toLowerCase()
        .includes(key)
    );
  }, [items, q]);

  function openCreate() {
    setDraft({ ...emptyDraft, code: "" });
  }

  function openEdit(row) {
    setDraft({
      id: row.id,
      name: row.name || "",
      code: row.code || "",
      legalName: row.legalName || "",
      vatNumber: row.vatNumber || "",
      taxCode: row.taxCode || "",
      sdiCode: row.sdiCode || "",
      pec: row.pec || "",
      address: row.address || "",
      cap: row.cap || "",
      city: row.city || "",
      province: row.province || "",
      country: row.country || "IT",
      phone: row.phone || "",
      email: row.email || "",
    });
  }

  async function saveSupplier() {
    const name = String(draft.name || "").trim();
    if (!name) {
      setError("Nome fornitore obbligatorio");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (draft.id) {
        await api(`/admin/suppliers/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            legalName: draft.legalName || null,
            vatNumber: draft.vatNumber || null,
            taxCode: draft.taxCode || null,
            sdiCode: draft.sdiCode || null,
            pec: draft.pec || null,
            address: draft.address || null,
            cap: draft.cap || null,
            city: draft.city || null,
            province: draft.province || null,
            country: draft.country || null,
            phone: draft.phone || null,
            email: draft.email || null,
          }),
        });
      } else {
        await api("/admin/suppliers", {
          method: "POST",
          body: JSON.stringify({
            name,
            code: draft.code || makeCode(name),
            legalName: draft.legalName || undefined,
            vatNumber: draft.vatNumber || undefined,
            taxCode: draft.taxCode || undefined,
            sdiCode: draft.sdiCode || undefined,
            pec: draft.pec || undefined,
            address: draft.address || undefined,
            cap: draft.cap || undefined,
            city: draft.city || undefined,
            province: draft.province || undefined,
            country: draft.country || undefined,
            phone: draft.phone || undefined,
            email: draft.email || undefined,
          }),
        });
      }
      setDraft(emptyDraft);
      await load();
    } catch {
      setError("Impossibile salvare fornitore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Fornitori</h1>
          <p>Anagrafica fornitori per arrivo merci e gestione fiscale/spese</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="panel">
        <div className="actions" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <input
            placeholder="Cerca nome, codice, P.IVA, email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 340 }}
          />
          <button className="btn primary" onClick={openCreate}>Nuovo fornitore</button>
        </div>

        <div className="table suppliers-table">
          <div className="row header">
            <div>Fornitore</div>
            <div>Codice</div>
            <div>P.IVA</div>
            <div>Città</div>
            <div>Contatti</div>
            <div>Azioni</div>
          </div>
          {filtered.map((row) => (
            <div key={row.id} className="row">
              <div>
                <strong>{row.name}</strong>
                <div className="muted">{row.legalName || "—"}</div>
              </div>
              <div className="mono">{row.code}</div>
              <div>{row.vatNumber || "—"}</div>
              <div>{[row.cap, row.city, row.province].filter(Boolean).join(" ") || "—"}</div>
              <div>
                <div>{row.phone || "—"}</div>
                <div className="muted">{row.email || "—"}</div>
              </div>
              <div className="actions">
                <button className="btn ghost small" onClick={() => openEdit(row)}>Modifica</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {draft.id || draft.name || draft.code ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>{draft.id ? "Modifica fornitore" : "Nuovo fornitore"}</h3>
          <div className="form-grid">
            <label>Nome *<input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Codice<input value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))} placeholder="auto se vuoto" /></label>
            <label>Ragione sociale<input value={draft.legalName} onChange={(e) => setDraft((p) => ({ ...p, legalName: e.target.value }))} /></label>
            <label>P.IVA<input value={draft.vatNumber} onChange={(e) => setDraft((p) => ({ ...p, vatNumber: e.target.value }))} /></label>
            <label>Codice fiscale<input value={draft.taxCode} onChange={(e) => setDraft((p) => ({ ...p, taxCode: e.target.value }))} /></label>
            <label>SDI<input value={draft.sdiCode} onChange={(e) => setDraft((p) => ({ ...p, sdiCode: e.target.value }))} /></label>
            <label>PEC<input value={draft.pec} onChange={(e) => setDraft((p) => ({ ...p, pec: e.target.value }))} /></label>
            <label>Email<input value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} /></label>
            <label>Telefono<input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} /></label>
            <label>Indirizzo<input value={draft.address} onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))} /></label>
            <label>CAP<input value={draft.cap} onChange={(e) => setDraft((p) => ({ ...p, cap: e.target.value }))} /></label>
            <label>Città<input value={draft.city} onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))} /></label>
            <label>Provincia<input value={draft.province} onChange={(e) => setDraft((p) => ({ ...p, province: e.target.value }))} /></label>
            <div className="actions">
              <button className="btn ghost" onClick={() => setDraft(emptyDraft)}>Annulla</button>
              <button className="btn primary" onClick={saveSupplier} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

