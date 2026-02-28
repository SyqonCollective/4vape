import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import {
  LuLayoutDashboard,
  LuChartNoAxesCombined,
  LuFileChartColumn,
  LuMail,
  LuPackage,
  LuTruck,
  LuBadgeCheck,
  LuTags,
  LuCloudDownload,
  LuPercent,
  LuSettings,
  LuShoppingCart,
  LuFileText,
  LuBoxes,
  LuClipboardList,
  LuArrowLeftRight,
  LuReceipt,
  LuWallet,
  LuShieldCheck,
  LuPackagePlus,
  LuRoute,
  LuUndo2,
  LuBuilding2,
  LuUserCog,
  LuChevronsLeft,
} from "react-icons/lu";
import { api, getToken, logout } from "../lib/api.js";
import Portal from "./Portal.jsx";
import logo from "../assets/logo.png";
import notificationOn from "../assets/NotificationOn.json";
import orderComplete from "../assets/OrderComplete.json";
import saleMp3 from "../assets/sale.mp3";
import generalMp3 from "../assets/general.mp3";

// CHECKLIST (admin richieste):
// [x] "Segna tutto come letto" campanella notifiche

const links = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LuLayoutDashboard },
  { to: "/admin/analytics", label: "Analytics", icon: LuChartNoAxesCombined },
  { to: "/admin/reports", label: "Report", icon: LuFileChartColumn },
  { to: "/admin/mail-marketing", label: "Mail marketing", icon: LuMail },
  { to: "/admin/products", label: "Prodotti", icon: LuPackage },
  { to: "/admin/supplier-registry", label: "Fornitori", icon: LuTruck },
  { to: "/admin/brands", label: "Brand", icon: LuBadgeCheck },
  { to: "/admin/categories", label: "Categorie", icon: LuTags },
  { to: "/admin/suppliers", label: "Drop", icon: LuCloudDownload },
  { to: "/admin/discounts", label: "Sconti e Regole", icon: LuPercent },
  { to: "/admin/settings", label: "Impostazioni", icon: LuSettings },
  { to: "/admin/orders", label: "Ordini", icon: LuShoppingCart },
  { to: "/admin/invoices", label: "Fatture", icon: LuFileText },
  { to: "/admin/inventory", label: "Inventario", icon: LuBoxes },
  { to: "/admin/goods-receipts", label: "Arrivo merci", icon: LuClipboardList },
  { to: "/admin/warehouse-movements", label: "Movimenti magazzino", icon: LuArrowLeftRight },
  { to: "/admin/expenses", label: "Registro spese", icon: LuReceipt },
  { to: "/admin/treasury", label: "Tesoreria", icon: LuWallet },
  { to: "/admin/fiscal", label: "Gestione fiscale", icon: LuShieldCheck },
  { to: "/admin/bundles", label: "Bundle prodotto", icon: LuPackagePlus },
  { to: "/admin/logistics", label: "Logistica", icon: LuRoute },
  { to: "/admin/returns", label: "Resi", icon: LuUndo2 },
  { to: "/admin/companies", label: "Clienti/Aziende", icon: LuBuilding2 },
  { to: "/admin/users", label: "Utenti admin", icon: LuUserCog },
];

const ORDER_KEY = "admin_sidebar_order";
const SIDEBAR_COLLAPSED_KEY = "admin_sidebar_collapsed";
const NOTIF_SEEN_KEY = "admin_notifications_seen_at";
const NOTIF_DISMISSED_KEY = "admin_notifications_dismissed";

function resolveAdminNameFromToken() {
  const clerkUser =
    window?.Clerk?.user ||
    window?.Clerk?.client?.activeSessions?.[0]?.user ||
    null;
  if (clerkUser) {
    const clerkName =
      clerkUser.firstName ||
      clerkUser.username ||
      clerkUser.primaryEmailAddress?.emailAddress ||
      clerkUser.emailAddresses?.[0]?.emailAddress;
    if (clerkName) {
      const firstPart = String(clerkName).split("@")[0].trim();
      if (firstPart) return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
    }
  }

  const token = getToken();
  if (!token || !token.includes(".")) return "Admin";
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    const raw =
      payload?.given_name ||
      payload?.first_name ||
      payload?.name ||
      payload?.email ||
      payload?.username ||
      "Admin";
    const firstPart = String(raw).split("@")[0].trim();
    if (!firstPart) return "Admin";
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  } catch {
    return "Admin";
  }
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState(() => resolveAdminNameFromToken());
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const baseOrderRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const notifPanelRef = useRef(null);
  const [seenAt, setSeenAt] = useState(() => Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0));
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(NOTIF_DISMISSED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const firstNotifLoadRef = useRef(true);
  const hasSuccessfulNotifFetchRef = useRef(false);
  const saleAudioRef = useRef(null);
  const generalAudioRef = useRef(null);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  );

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (n) => !dismissedIds.has(n.id) && new Date(n.createdAt).getTime() > seenAt
      ).length,
    [notifications, seenAt, dismissedIds]
  );

  const visibleNotifications = useMemo(
    () =>
      notifications.filter(
        (n) => !dismissedIds.has(n.id) && new Date(n.createdAt).getTime() > seenAt
      ),
    [notifications, dismissedIds, seenAt]
  );

  function markNotificationsSeen() {
    const latestCreatedAt = notifications.reduce((maxTs, n) => {
      const ts = new Date(n.createdAt).getTime();
      return Number.isFinite(ts) ? Math.max(maxTs, ts) : maxTs;
    }, 0);
    const now = Date.now();
    // Use the max server/client timestamp to avoid "new" items stuck because of clock skew.
    const effectiveSeenAt = Math.max(now, latestCreatedAt + 1000);
    setSeenAt(effectiveSeenAt);
    localStorage.setItem(NOTIF_SEEN_KEY, String(effectiveSeenAt));

    // Read notifications are permanently hidden from the bell list.
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const n of notifications) {
        if (new Date(n.createdAt).getTime() <= effectiveSeenAt) next.add(n.id);
      }
      localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function markAllNotificationsAsReadAndHide() {
    markNotificationsSeen();
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const n of notifications) next.add(n.id);
      localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function dismissNotification(id) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  async function fetchNotifications() {
    setNotifLoading(true);
    try {
      const res = await api("/admin/notifications");
      const incoming = (res?.items || []).map((n) => ({
        ...n,
        createdAt: new Date(n.createdAt).toISOString(),
      }));
      setNotifications((prev) => {
        const prevIds = new Set(prev.map((x) => x.id));
        const fresh = incoming.filter((x) => !prevIds.has(x.id));

        if (hasSuccessfulNotifFetchRef.current && fresh.length > 0) {
          const hasOrder = fresh.some((x) => x.type === "ORDER_PAID_OR_COMPLETED");
          const hasOther = fresh.some((x) => x.type !== "NEW_ORDER");
          if (hasOrder && saleAudioRef.current) {
            saleAudioRef.current.currentTime = 0;
            saleAudioRef.current.play().catch(() => {});
          }
          if (hasOther && generalAudioRef.current) {
            generalAudioRef.current.currentTime = 0;
            generalAudioRef.current.play().catch(() => {});
          }
        }

        const map = new Map(prev.map((x) => [x.id, x]));
        for (const item of incoming) {
          map.set(item.id, { ...(map.get(item.id) || {}), ...item });
        }
        return Array.from(map.values())
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 60);
      });
      hasSuccessfulNotifFetchRef.current = true;
      setNotifError("");
    } catch {
      setNotifError("Impossibile aggiornare notifiche");
    } finally {
      firstNotifLoadRef.current = false;
      setNotifLoading(false);
    }
  }

  useEffect(() => {
    saleAudioRef.current = new Audio(saleMp3);
    generalAudioRef.current = new Audio(generalMp3);
    saleAudioRef.current.preload = "auto";
    generalAudioRef.current.preload = "auto";
    fetchNotifications();
    const id = setInterval(fetchNotifications, 5000);
    return () => {
      clearInterval(id);
      saleAudioRef.current = null;
      generalAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const refreshName = () => setAdminName(resolveAdminNameFromToken());
    refreshName();
    const t = setInterval(refreshName, 1200);
    window.addEventListener("storage", refreshName);
    return () => {
      clearInterval(t);
      window.removeEventListener("storage", refreshName);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!notifOpen) return;
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [notifOpen]);

  function toggleNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
  }

  function openNotification(item) {
    markNotificationsSeen();
    setNotifOpen(false);
    navigate(item.href || "/admin/dashboard");
  }

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

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className={`admin-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="admin-sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src={logo} alt="4Vape B2B" className="brand-logo" />
          </div>
          <div className="brand-text">
            <div className="brand-greeting">
              <span>Buon lavoro,</span>
              <strong>{adminName}</strong>
            </div>
          </div>
        </div>

        <nav className="admin-nav">
          {order.map((l) => {
            const Icon = l.icon;
            return (
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
                title={sidebarCollapsed ? l.label : undefined}
              >
                <span className="nav-grip" aria-hidden="true">⋮⋮</span>
                <span className="nav-icon" aria-hidden="true"><Icon size={15} /></span>
                <span className="nav-label">{l.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleSidebarCollapsed}
          title={sidebarCollapsed ? "Espandi sidebar" : "Compatta sidebar"}
          aria-label={sidebarCollapsed ? "Espandi sidebar" : "Compatta sidebar"}
        >
          <LuChevronsLeft />
        </button>
      </aside>

      <main className="admin-main">
        <div className="admin-main-inner">
          <div className="admin-topbar">
            <div>
              <div className="top-title">Admin Panel</div>
              <div className="top-sub">4Vape B2B Console</div>
            </div>
            <div className="topbar-actions" ref={notifPanelRef}>
              <button className="notif-btn" onClick={toggleNotifications} aria-label="Notifiche">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3a5 5 0 0 0-5 5v2.6c0 .7-.2 1.4-.6 2L5 15h14l-1.4-2.4c-.4-.6-.6-1.3-.6-2V8a5 5 0 0 0-5-5Zm0 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21Z" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                ) : null}
                {unreadCount > 0 ? (
                  <span className="notif-anim">
                    <Lottie animationData={notificationOn} loop />
                  </span>
                ) : null}
              </button>

              {notifOpen ? (
                <div className="notif-panel">
                  <div className="notif-header">
                    <strong>Notifiche</strong>
                    <span>{unreadCount > 0 ? `${unreadCount} nuove` : "Aggiornate"}</span>
                  </div>
                  <div className="notif-list">
                    {notifLoading && visibleNotifications.length === 0 ? (
                      <div className="notif-empty">Caricamento...</div>
                    ) : null}
                    {notifError ? <div className="notif-empty">{notifError}</div> : null}
                    {!visibleNotifications.length && !notifLoading ? (
                      <div className="notif-empty">Nessuna notifica</div>
                    ) : null}
                    {visibleNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${new Date(n.createdAt).getTime() > seenAt ? "is-new" : ""}`}
                      >
                        <button className="notif-main" onClick={() => openNotification(n)}>
                          <div className="notif-item-title">
                            <span>{n.title}</span>
                            {n.type === "ORDER_PAID_OR_COMPLETED" ? (
                              <span className="notif-order-anim">
                                <Lottie animationData={orderComplete} loop />
                              </span>
                            ) : null}
                          </div>
                          <div className="notif-item-body">{n.message}</div>
                          <div className="notif-item-date">
                            {new Date(n.createdAt).toLocaleString("it-IT")}
                          </div>
                        </button>
                        <button
                          className="notif-dismiss"
                          title="Elimina notifica"
                          onClick={() => dismissNotification(n.id)}
                        >
                          ✓
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="notif-footer">
                    <button className="btn ghost small" onClick={markAllNotificationsAsReadAndHide}>
                      Segna tutto come letto
                    </button>
                  </div>
                </div>
              ) : null}
              <button className="btn ghost" onClick={onLogout}>Logout</button>
            </div>
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
                    onClick={async () => {
                      await logout();
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
