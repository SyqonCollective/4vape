import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import InlineError from "../../components/InlineError.jsx";

export default function AdminOrders() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/orders");
        if (!active) return;
        setItems(res);
      } catch (err) {
        setError("Impossibile caricare ordini");
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
          <h1>Ordini</h1>
          <p>Lista ordini B2B</p>
        </div>
      </div>

      <InlineError message={error} onClose={() => setError("")} />

      <div className="table">
        <div className="row header">
          <div>ID</div>
          <div>Stato</div>
          <div>Totale</div>
          <div>Creato</div>
        </div>
        {items.map((o) => (
          <div className="row" key={o.id}>
            <div className="mono">{o.id.slice(0, 8)}</div>
            <div>{o.status}</div>
            <div>€ {Number(o.total).toFixed(2)}</div>
            <div>{new Date(o.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
