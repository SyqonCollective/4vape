import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import AdminLayout from "./components/AdminLayout.jsx";
import ClerkBridge from "./components/ClerkBridge.jsx";
import AdminLogin from "./pages/admin/Login.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminAnalytics from "./pages/admin/Analytics.jsx";
import AdminProducts from "./pages/admin/Products.jsx";
import AdminBrands from "./pages/admin/Brands.jsx";
import AdminSuppliers from "./pages/admin/Suppliers.jsx";
import AdminSupplierRegistry from "./pages/admin/SupplierRegistry.jsx";
import AdminDiscounts from "./pages/admin/DiscountRules.jsx";
import AdminCategories from "./pages/admin/Categories.jsx";
import AdminOrders from "./pages/admin/Orders.jsx";
import AdminInvoices from "./pages/admin/Invoices.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminSettings from "./pages/admin/Settings.jsx";
import AdminCompanies from "./pages/admin/Companies.jsx";
import AdminInventory from "./pages/admin/Inventory.jsx";
import AdminGoodsReceipts from "./pages/admin/GoodsReceipts.jsx";
import AdminReturns from "./pages/admin/Returns.jsx";
import AdminReports from "./pages/admin/Reports.jsx";
import AdminMailMarketing from "./pages/admin/MailMarketing.jsx";
import AdminExpenses from "./pages/admin/Expenses.jsx";
import AdminTreasury from "./pages/admin/Treasury.jsx";
import AdminWarehouseMovements from "./pages/admin/WarehouseMovements.jsx";
import AdminFiscal from "./pages/admin/Fiscal.jsx";
import AdminBundles from "./pages/admin/Bundles.jsx";
import AdminLogistics from "./pages/admin/Logistics.jsx";
import RegisterCompany from "./pages/RegisterCompany.jsx";
import ReturnsTest from "./pages/ReturnsTest.jsx";
import PublicHome from "./pages/PublicHome.jsx";
import { getToken } from "./lib/api.js";

const ADMIN_HOST_RE = /(^|\.)logistica4vape\.it$/i;
const runtimeAdminHost =
  typeof window !== "undefined" && ADMIN_HOST_RE.test(window.location.hostname);
const clerkEnabled = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    runtimeAdminHost
);

function RequireAuthLegacy({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireAuthClerk({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  const Guard = clerkEnabled ? RequireAuthClerk : RequireAuthLegacy;
  return (
    <>
      {clerkEnabled ? <ClerkBridge /> : null}
      <Routes>
        <Route path="/" element={<PublicHome />} />
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
          <Route path="supplier-registry" element={<AdminSupplierRegistry />} />
          <Route path="discounts" element={<AdminDiscounts />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="invoices" element={<AdminInvoices />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="goods-receipts" element={<AdminGoodsReceipts />} />
          <Route path="warehouse-movements" element={<AdminWarehouseMovements />} />
          <Route path="expenses" element={<AdminExpenses />} />
          <Route path="treasury" element={<AdminTreasury />} />
          <Route path="fiscal" element={<AdminFiscal />} />
          <Route path="bundles" element={<AdminBundles />} />
          <Route path="logistics" element={<AdminLogistics />} />
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
