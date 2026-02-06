import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../lib/api.js";

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/products", label: "Prodotti" },
  { to: "/admin/suppliers", label: "Fornitori" },
  { to: "/admin/orders", label: "Ordini" },
  { to: "/admin/users", label: "Utenti" },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  function onLogout() {
    clearToken();
    navigate("/admin/login");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          <div className="brand-mark">4V</div>
          <div className="brand-text">
            <div className="brand-title">4Vape B2B</div>
            <div className="brand-sub">Console Admin</div>
          </div>
        </div>

        <nav className="admin-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
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
    </div>
  );
}
