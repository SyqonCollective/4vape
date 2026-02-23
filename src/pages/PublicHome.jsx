import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import logo from "../assets/logo.png";

function toApiImage(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw;
}

const euro = (value) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));

export default function PublicHome() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ categories: [], totals: { categories: 0, products: 0 } });
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/catalog/public");
        setData(res || { categories: [], totals: { categories: 0, products: 0 } });
      } catch {
        setError("Impossibile caricare catalogo pubblico");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.categories || [];
    return (data.categories || [])
      .map((cat) => ({
        ...cat,
        products: (cat.products || []).filter((p) =>
          [p.name, p.sku, p.brand, p.shortDescription].join(" ").toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.products.length > 0 || String(cat.name || "").toLowerCase().includes(q));
  }, [search, data.categories]);

  return (
    <main className="public-home">
      <header className="public-hero">
        <div className="public-hero-bg" />
        <div className="public-hero-content">
          <img src={logo} alt="Svapo Distribuzione" className="public-logo" />
          <h1>Svapo Distribuzione</h1>
          <p>Catalogo B2B prodotti per categoria, con immagini e schede complete.</p>
          <div className="public-stats">
            <span>{data.totals?.categories || 0} categorie</span>
            <span>{data.totals?.products || 0} prodotti</span>
          </div>
          <div className="public-search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca prodotto per nome, SKU o brand..."
            />
          </div>
        </div>
      </header>

      {error ? <div className="public-error">{error}</div> : null}
      {loading ? <div className="public-loading">Caricamento catalogo…</div> : null}

      <section className="public-categories">
        {filtered.map((category) => (
          <article className="public-category" key={category.id}>
            <div className="public-category-head">
              <h2>{category.name}</h2>
              <span>{category.productsCount} prodotti</span>
            </div>
            {category.description ? (
              <div
                className="public-category-desc"
                dangerouslySetInnerHTML={{ __html: category.description }}
              />
            ) : null}
            <div className="public-products-grid">
              {(category.products || []).map((p) => (
                <div className="public-product-card" key={`${category.id}-${p.id}`}>
                  <div className="public-product-media">
                    {p.imageUrl ? (
                      <img src={toApiImage(p.imageUrl)} alt={p.name} loading="lazy" />
                    ) : (
                      <div className="public-product-placeholder">No image</div>
                    )}
                  </div>
                  <div className="public-product-body">
                    <div className="public-product-meta">
                      <span className="sku">{p.sku}</span>
                      {p.brand ? <span className="brand">{p.brand}</span> : null}
                    </div>
                    <h3>{p.name}</h3>
                    {p.shortDescription ? <p>{p.shortDescription}</p> : null}
                    <div className="public-product-prices">
                      <div>
                        <label>Prezzo</label>
                        <strong>{euro(p.price)}</strong>
                      </div>
                      <div>
                        <label>Prezzo consigliato</label>
                        <strong>{euro(p.suggestedPrice)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

