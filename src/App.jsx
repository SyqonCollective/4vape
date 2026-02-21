import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import AdminLayout from "./components/AdminLayout.jsx";
import ClerkBridge from "./components/ClerkBridge.jsx";
import AdminLogin from "./pages/admin/Login.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminAnalytics from "./pages/admin/Analytics.jsx";
import AdminProducts from "./pages/admin/Products.jsx";
import AdminBrands from "./pages/admin/Brands.jsx";
import AdminSuppliers from "./pages/admin/Suppliers.jsx";
import AdminDiscounts from "./pages/admin/DiscountRules.jsx";
import AdminCategories from "./pages/admin/Categories.jsx";
import AdminOrders from "./pages/admin/Orders.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminSettings from "./pages/admin/Settings.jsx";
import AdminCompanies from "./pages/admin/Companies.jsx";
import AdminInventory from "./pages/admin/Inventory.jsx";
import AdminGoodsReceipts from "./pages/admin/GoodsReceipts.jsx";
import AdminReturns from "./pages/admin/Returns.jsx";
import AdminReports from "./pages/admin/Reports.jsx";
import AdminMailMarketing from "./pages/admin/MailMarketing.jsx";
import RegisterCompany from "./pages/RegisterCompany.jsx";
import ReturnsTest from "./pages/ReturnsTest.jsx";
import { api, getToken, logout, setToken } from "./lib/api.js";

const clerkEnabled = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

function RequireAuthLegacy({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireAuthClerk({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function bootstrapToken() {
      if (!isLoaded || !isSignedIn) {
        if (mounted) {
          setAllowed(false);
          setReady(true);
        }
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          if (mounted) {
            setAllowed(false);
            setReady(true);
          }
          return;
        }
        setToken(token);
        let me = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            me = await api("/auth/me");
            break;
          } catch {
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            }
          }
        }
        const role = String(me?.role || "");
        if (!me || (role !== "ADMIN" && role !== "MANAGER")) {
          await logout();
          if (mounted) {
            setAllowed(false);
            setReady(true);
          }
          return;
        }
        if (mounted) {
          setAllowed(true);
          setReady(true);
        }
        return;
      } catch {
        if (mounted) {
          setAllowed(false);
          setReady(true);
        }
      } finally {
        // no-op: ready is explicitly controlled above
      }
    }
    bootstrapToken();
    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || !ready) return null;
  if (!isSignedIn || !allowed) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  const Guard = clerkEnabled ? RequireAuthClerk : RequireAuthLegacy;
  return (
    <>
      {clerkEnabled ? <ClerkBridge /> : null}
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/register" element={<RegisterCompany />} />
        <Route path="/returns-test" element={<ReturnsTest />} />
        <Route
          path="/admin"
          element={
            <Guard>
              <AdminLayout />
            </Guard>
          }
        >
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="brands" element={<AdminBrands />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="suppliers" element={<AdminSuppliers />} />
          <Route path="discounts" element={<AdminDiscounts />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="goods-receipts" element={<AdminGoodsReceipts />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="mail-marketing" element={<AdminMailMarketing />} />
          <Route path="companies" element={<AdminCompanies />} />
          <Route path="users" element={<AdminUsers />} />
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </>
  );
}
