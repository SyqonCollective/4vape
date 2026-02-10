import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/admin/users");
        if (!active) return;
        setUsers(res || []);
      } catch {
        setError("Impossibile caricare utenti admin");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const adminUsers = users.filter((u) => u.role === "ADMIN" || u.role === "MANAGER");

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Utenti admin</h1>
          <p>Account amministrativi e manager</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="table">
        <div className="row header">
          <div>Email</div>
          <div>Ruolo</div>
          <div>Azienda</div>
        </div>
        {adminUsers.length === 0 ? (
          <div className="row">
            <div className="muted">Nessun utente admin</div>
            <div />
            <div />
          </div>
        ) : (
          adminUsers.map((u) => (
            <div className="row" key={u.id}>
              <div>{u.email}</div>
              <div>{u.role}</div>
              <div>{u.company?.name || "—"}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
