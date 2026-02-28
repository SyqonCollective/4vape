import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";
import Portal from "../../components/Portal.jsx";

const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Ordini" },
  { key: "products", label: "Prodotti" },
  { key: "categories", label: "Categorie" },
  { key: "brands", label: "Brand" },
  { key: "inventory", label: "Inventario" },
  { key: "goodsReceipts", label: "Arrivo merce" },
  { key: "warehouseMovements", label: "Movimenti" },
  { key: "invoices", label: "Fatture" },
  { key: "fiscal", label: "Gest. Fiscale" },
  { key: "treasury", label: "Tesoreria" },
  { key: "expenses", label: "Spese" },
  { key: "reports", label: "Report" },
  { key: "companies", label: "Clienti" },
  { key: "suppliers", label: "Fornitori" },
  { key: "returns", label: "Resi" },
  { key: "bundles", label: "Bundle" },
  { key: "discounts", label: "Sconti" },
  { key: "logistics", label: "Logistica" },
  { key: "settings", label: "Impostazioni" },
  { key: "users", label: "Utenti" },
];

const ROLE_LABELS = { ADMIN: "Admin", MANAGER: "Manager", BUYER: "Buyer" };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ email: "", password: "", role: "MANAGER", permissions: {} });

  async function load() {
    try {
      const res = await api("/admin/users");
      setUsers(res || []);
    } catch {
      setError("Impossibile caricare utenti admin");
    }
  }

  useEffect(() => { load(); }, []);

  const adminUsers = useMemo(
    () => users.filter((u) => u.role === "ADMIN" || u.role === "MANAGER"),
    [users]
  );

  function openCreate() {
    setDraft({ email: "", password: "", role: "MANAGER", permissions: {} });
    setShowCreate(true);
  }

  function openEdit(u) {
    setEditUser(u);
    setDraft({
      email: u.email,
      password: "",
      role: u.role,
      permissions: u.permissions || {},
    });
  }

  async function createUser() {
    if (!draft.email || !draft.password) { setError("Email e password obbligatori"); return; }
    setSaving(true);
    try {
      await api("/admin/users/admin", {
        method: "POST",
        body: JSON.stringify({
          email: draft.email,
          password: draft.password,
          role: draft.role,
          permissions: draft.permissions,
        }),
      });
      setShowCreate(false);
      await load();
    } catch {
      setError("Impossibile creare utente");
    } finally { setSaving(false); }
  }

  async function updateUser() {
    if (!editUser) return;
    setSaving(true);
    try {
      await api(`/admin/users/${editUser.id}/admin`, {
        method: "PATCH",
        body: JSON.stringify({
          role: draft.role,
          permissions: draft.permissions,
        }),
      });
      setEditUser(null);
      await load();
    } catch {
      setError("Impossibile aggiornare utente");
    } finally { setSaving(false); }
  }

  async function deleteUser(id) {
    if (!confirm("Eliminare questo utente admin?")) return;
    try {
      await api(`/admin/users/${id}/admin`, { method: "DELETE" });
      setEditUser(null);
      await load();
    } catch {
      setError("Impossibile eliminare utente");
    }
  }

  function togglePerm(key) {
    setDraft((p) => ({
      ...p,
      permissions: { ...p.permissions, [key]: !p.permissions[key] },
    }));
  }

  function selectAllPerms(val) {
    const perms = {};
    SECTIONS.forEach((s) => { perms[s.key] = val; });
    setDraft((p) => ({ ...p, permissions: perms }));
  }

  function renderPermissionGrid() {
    return (
      <div className="users-permissions-grid">
        <div className="users-perm-header">
          <strong>Permessi sezioni</strong>
          <div>
            <button className="btn ghost small" type="button" onClick={() => selectAllPerms(true)}>Tutti</button>
            <button className="btn ghost small" type="button" onClick={() => selectAllPerms(false)}>Nessuno</button>
          </div>
        </div>
        <div className="users-perm-list">
          {SECTIONS.map((s) => (
            <label key={s.key} className="users-perm-item">
              <input type="checkbox" checked={!!draft.permissions[s.key]} onChange={() => togglePerm(s.key)} />
              {s.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Utenti admin</h1>
          <p>Account amministrativi e manager</p>
        </div>
        <button className="btn primary" onClick={openCreate}>Nuovo utente admin</button>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="cards">
        <div className="card"><div className="card-label">Totale admin</div><div className="card-value">{adminUsers.length}</div></div>
      </div>

      <div className="table users-table-pro">
        <div className="row header">
          <div>Email</div>
          <div>Ruolo</div>
          <div>Azienda</div>
          <div>Stato</div>
          <div>Azioni</div>
        </div>
        {adminUsers.length === 0 ? (
          <div className="row">
            <div className="muted">Nessun utente admin</div>
            <div /><div /><div /><div />
          </div>
        ) : (
          adminUsers.map((u) => (
            <div className="row" key={u.id}>
              <div>{u.email}</div>
              <div><span className="tag">{ROLE_LABELS[u.role] || u.role}</span></div>
              <div>{u.company?.name || "—"}</div>
              <div><span className={`tag ${u.approved ? "success" : "warn"}`}>{u.approved ? "Attivo" : "Non approvato"}</span></div>
              <div className="actions">
                <button className="btn ghost small" onClick={() => openEdit(u)}>Modifica</button>
                <button className="btn ghost small danger" onClick={() => deleteUser(u.id)}>Elimina</button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Nuovo utente admin</h3>
                <button className="btn ghost" onClick={() => setShowCreate(false)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>Email<input type="email" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} /></label>
                  <label>Password<input type="password" value={draft.password} onChange={(e) => setDraft((p) => ({ ...p, password: e.target.value }))} /></label>
                  <label>Ruolo
                    <select className="select" value={draft.role} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}>
                      <option value="ADMIN">Admin</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </label>
                </div>
                {renderPermissionGrid()}
                <div className="actions">
                  <button className="btn ghost" onClick={() => setShowCreate(false)}>Annulla</button>
                  <button className="btn primary" onClick={createUser} disabled={saving}>{saving ? "Salvataggio..." : "Crea utente"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {editUser && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setEditUser(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Modifica utente: {editUser.email}</h3>
                <button className="btn ghost" onClick={() => setEditUser(null)}>Chiudi</button>
              </div>
              <div className="modal-body modal-body-single">
                <div className="form-grid">
                  <label>Ruolo
                    <select className="select" value={draft.role} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}>
                      <option value="ADMIN">Admin</option>
                      <option value="MANAGER">Manager</option>
                      <option value="BUYER">Buyer</option>
                    </select>
                  </label>
                </div>
                {renderPermissionGrid()}
                <div className="actions">
                  <button className="btn ghost" onClick={() => setEditUser(null)}>Annulla</button>
                  <button className="btn primary" onClick={updateUser} disabled={saving}>{saving ? "Salvataggio..." : "Salva modifiche"}</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}
