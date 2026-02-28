import { SignIn } from "@clerk/clerk-react";
import logo from "../../assets/logo.png";
import AuthSmokeBackground from "../../components/AuthSmokeBackground.jsx";

export default function AdminLogin() {
  const runtimeAdminHost =
    typeof window !== "undefined" && /(^|\.)logistica4vape\.it$/i.test(window.location.hostname);
  const hasClerkKey = Boolean(
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
      import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      runtimeAdminHost
  );
  const adminOrigin = import.meta.env.VITE_ADMIN_ORIGIN || "https://logistica4vape.it";
  const forceRedirectUrl =
    import.meta.env.VITE_CLERK_SIGN_IN_FORCE_REDIRECT_URL || `${adminOrigin}/admin/dashboard`;
  const fallbackRedirectUrl =
    import.meta.env.VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL || `${adminOrigin}/admin/dashboard`;
  const signUpUrl = import.meta.env.VITE_CLERK_SIGN_UP_URL || `${adminOrigin}/register`;

  return (
    <div className="auth-wrap auth-epic">
      <div className="auth-scene">
        <AuthSmokeBackground />
        <div className="auth-vignette" />
      </div>
      <div className="auth-simple-login">
        <img src={logo} alt="4Vape B2B" className="auth-logo" />
        <h1 className="auth-simple-title">Accedi al pannello admin</h1>
        {hasClerkKey ? (
          <SignIn
            routing="virtual"
            forceRedirectUrl={forceRedirectUrl}
            fallbackRedirectUrl={fallbackRedirectUrl}
            signUpUrl={signUpUrl}
            appearance={{
              variables: {
                colorText: "#e8f2ff",
                colorTextSecondary: "#c5d8f3",
                colorPrimary: "#2ba9ff",
                colorDanger: "#fca5a5",
                colorInputText: "#0f172a",
                colorInputBackground: "#f4f8ff",
                colorBackground: "transparent",
              },
              elements: {
                rootBox: { width: "100%" },
                card: {
                  boxShadow: "none",
                  border: "none",
                  background: "transparent",
                  borderRadius: "0",
                  padding: 0,
                },
                headerTitle: { display: "none" },
                headerSubtitle: { display: "none" },
                footer: { display: "none" },
                socialButtonsBlockButton: { display: "none" },
                dividerRow: { display: "none" },
                formFieldLabel: { display: "none" },
                formFieldInput: {
                  borderRadius: "12px",
                  background: "rgba(245, 249, 255, 0.9)",
                  border: "1px solid rgba(120, 145, 182, 0.45)",
                  color: "#0f172a",
                  height: "46px",
                },
                formButtonPrimary: {
                  borderRadius: "12px",
                  height: "44px",
                  background: "linear-gradient(135deg, #1f7dff, #2bc4ff)",
                  fontWeight: 700,
                },
                formButtonReset: {
                  background: "rgba(12, 22, 38, 0.9)",
                  border: "1px solid rgba(103, 137, 184, 0.35)",
                  borderRadius: "12px",
                  color: "#dcecff",
                },
                alternativeMethods: {
                  background: "rgba(8, 15, 26, 0.72)",
                  border: "1px solid rgba(103, 137, 184, 0.2)",
                  borderRadius: "12px",
                },
                alternativeMethodsBlockButton: {
                  background: "rgba(245, 249, 255, 0.92)",
                  border: "1px solid rgba(120, 145, 182, 0.45)",
                  borderRadius: "12px",
                },
                alternativeMethodsBlockButtonText: {
                  color: "#0f172a",
                },
                alternativeMethodsBlockButtonArrow: {
                  color: "#0f172a",
                },
                formFieldAction: { color: "#9ed4ff" },
                formFieldActionLink: { color: "#9ed4ff" },
                footerActionText: { color: "#d5e7ff" },
                footerActionLink: { color: "#9ed4ff" },
                identityPreviewText: { color: "#e8f2ff" },
                identityPreviewEditButton: { color: "#9ed4ff" },
                formResendCodeLink: { color: "#9ed4ff" },
                otpCodeFieldInput: {
                  borderRadius: "10px",
                  background: "rgba(245, 249, 255, 0.96)",
                  border: "1px solid rgba(120, 145, 182, 0.45)",
                  color: "#0f172a",
                },
              },
            }}
          />
        ) : (
          <div className="panel" style={{ width: "100%", textAlign: "center", color: "#dbeafe" }}>
            Configurazione Clerk mancante.
          </div>
        )}
      </div>
    </div>
  );
}
