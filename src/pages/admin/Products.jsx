import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await api("/admin/products");
        if (!active) return;
        setItems(res);
      } catch (err) {
        setError("Impossibile caricare i prodotti");
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
          <h1>Prodotti</h1>
          <p>Catalogo principale con giacenze</p>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="table">
        <div className="row header">
          <div>SKU</div>
          <div>Nome</div>
          <div>Prezzo</div>
          <div>Giacenza</div>
          <div>Fonte</div>
        </div>
        {items.map((p) => (
          <div className="row" key={p.id}>
            <div className="mono">{p.sku}</div>
            <div>{p.name}</div>
            <div>€ {Number(p.price).toFixed(2)}</div>
            <div>{p.stockQty}</div>
            <div>{p.source}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
