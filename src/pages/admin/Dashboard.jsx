import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ products: 0, pendingUsers: 0, orders: 0, suppliers: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [products, pendingUsers, orders, suppliers] = await Promise.all([
          api("/admin/products"),
          api("/admin/users/pending"),
          api("/orders"),
          api("/admin/suppliers"),
        ]);
        if (!active) return;
        setStats({
          products: products.length,
          pendingUsers: pendingUsers.length,
          orders: orders.length,
          suppliers: suppliers.length,
        });
      } catch (err) {
        setError("Impossibile caricare i dati");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Panoramica veloce dell'attività</p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="cards">
        <div className="card">
          <div className="card-label">Prodotti</div>
          <div className="card-value">{stats.products}</div>
        </div>
        <div className="card">
          <div className="card-label">Ordini</div>
          <div className="card-value">{stats.orders}</div>
        </div>
        <div className="card">
          <div className="card-label">Utenti da approvare</div>
          <div className="card-value">{stats.pendingUsers}</div>
        </div>
        <div className="card">
          <div className="card-label">Fornitori</div>
          <div className="card-value">{stats.suppliers}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Prossimi step</h2>
        <ul className="list">
          <li>Carica i prodotti dal fornitore principale</li>
          <li>Approva i nuovi clienti B2B</li>
          <li>Verifica le giacenze aggiornate</li>
        </ul>
      </div>
    </section>
  );
}
