import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminUsers() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await api("/admin/users/pending");
      setItems(res);
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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Utenti</h1>
          <p>Approva nuovi account B2B</p>
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
    </section>
  );
}
