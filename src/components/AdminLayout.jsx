import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMemo, useRef, useState } from "react";
import { clearToken } from "../lib/api.js";
import Portal from "./Portal.jsx";
import logo from "../assets/logo.png";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/products", label: "Prodotti" },
  { to: "/admin/categories", label: "Categorie" },
  { to: "/admin/suppliers", label: "Fornitori" },
  { to: "/admin/settings", label: "Impostazioni" },
  { to: "/admin/orders", label: "Ordini" },
  { to: "/admin/users", label: "Utenti" },
];

const ORDER_KEY = "admin_sidebar_order";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const baseOrderRef = useRef(null);

  const orderedLinks = useMemo(() => {
    const saved = localStorage.getItem(ORDER_KEY);
    if (!saved) return links;
    try {
      const ids = JSON.parse(saved);
      const map = new Map(links.map((l) => [l.to, l]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean);
      for (const l of links) {
        if (!ordered.includes(l)) ordered.push(l);
      }
      return ordered;
    } catch {
      return links;
    }
  }, []);

  const [order, setOrder] = useState(orderedLinks);

  function onLogout() {
    setConfirmLogout(true);
  }

  function persist(next) {
    setOrder(next);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next.map((l) => l.to)));
  }

  function onDragStart(item) {
    baseOrderRef.current = order;
    setDragging(item.to);
  }

  function onDragOverItem(e, item) {
    e.preventDefault();
    if (!dragging || item.to === dragging) return;
    setDragOver(item.to);
    const current = [...order];
    const fromIdx = current.findIndex((l) => l.to === dragging);
    const toIdx = current.findIndex((l) => l.to === item.to);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    setOrder(current);
  }

  function onDropItem(e, item) {
    e.preventDefault();
    if (!dragging) return;
    persist(order);
    setDragging(null);
    setDragOver(null);
    baseOrderRef.current = null;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src={logo} alt="4Vape B2B" className="brand-logo" />
          </div>
          <div className="brand-text">
            <div className="brand-title">4Vape B2B</div>
            <div className="brand-sub">Console Admin</div>
          </div>
        </div>

        <nav className="admin-nav">
          {order.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              draggable
              onDragStart={() => onDragStart(l)}
              onDragOver={(e) => onDragOverItem(e, l)}
              onDrop={(e) => onDropItem(e, l)}
              onDragEnd={() => {
                if (baseOrderRef.current) setOrder(baseOrderRef.current);
                setDragging(null);
                setDragOver(null);
                baseOrderRef.current = null;
              }}
              className={({ isActive }) => {
                const classes = ["nav-item"];
                if (isActive) classes.push("active");
                if (dragOver === l.to) classes.push("drag-over");
                if (dragging === l.to) classes.push("dragging");
                return classes.join(" ");
              }}
            >
              <span className="nav-grip" aria-hidden="true">⋮⋮</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="admin-main">
        <div className="admin-main-inner">
          <div className="admin-topbar">
            <div>
              <div className="top-title">Admin Panel</div>
              <div className="top-sub">4Vape B2B Console</div>
            </div>
            <button className="btn ghost" onClick={onLogout}>Logout</button>
          </div>
          <Outlet />
        </div>
      </main>
      {confirmLogout ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setConfirmLogout(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <h3>Confermi logout?</h3>
                </div>
                <button className="btn ghost" onClick={() => setConfirmLogout(false)}>Annulla</button>
              </div>
              <div className="modal-body">
                <p>Sei sicuro di voler uscire dall'area admin?</p>
                <div className="actions">
                  <button className="btn ghost" onClick={() => setConfirmLogout(false)}>Resta</button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      clearToken();
                      navigate("/admin/login");
                    }}
                  >
                    Esci
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
