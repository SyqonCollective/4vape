import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import "./index.css";

const ADMIN_HOST_RE = /(^|\.)logistica4vape\.it$/i;
const isAdminHost = typeof window !== "undefined" && ADMIN_HOST_RE.test(window.location.hostname);
const fallbackAdminClerkKey = isAdminHost ? "pk_live_Y2xlcmsubG9naXN0aWNhNHZhcGUuaXQk" : "";
const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  fallbackAdminClerkKey;

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  clerkPublishableKey ? (
    <ClerkProvider publishableKey={clerkPublishableKey}>{app}</ClerkProvider>
  ) : (
    app
  )
);
