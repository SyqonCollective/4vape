import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import { SignIn } from "@clerk/clerk-react";
import correctAnim from "../../assets/Correct.json";
import logo from "../../assets/logo.png";
import { api, setToken } from "../../lib/api.js";
import AuthSmokeBackground from "../../components/AuthSmokeBackground.jsx";

export default function AdminLogin() {
  const clerkEnabled = Boolean(
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      setShowSuccess(true);
      setTimeout(() => navigate("/admin/dashboard"), 1400);
    } catch (err) {
      setError("Credenziali non valide o utente non approvato");
    } finally {
      setLoading(false);
    }
  }

  if (clerkEnabled) {
    return (
      <div className="auth-wrap auth-epic">
        <div className="auth-scene">
          <AuthSmokeBackground />
          <div className="auth-vignette" />
        </div>
        <div className="auth-simple-login">
          <img src={logo} alt="4Vape B2B" className="auth-logo" />
          <h1 className="auth-simple-title">Accedi al pannello admin</h1>
          <SignIn
            routing="virtual"
            forceRedirectUrl="/admin/dashboard"
            fallbackRedirectUrl="/admin/dashboard"
            signUpUrl="/register"
            appearance={{
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
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap auth-epic">
      <div className="auth-scene">
        <AuthSmokeBackground />
        <div className="auth-vignette" />
      </div>
      {showSuccess ? (
        <div className="login-success">
          <div className="login-success-card">
            <Lottie animationData={correctAnim} loop={false} />
            <div className="login-success-text">Accesso confermato</div>
          </div>
        </div>
      ) : null}
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">Admin</div>
          <img src={logo} alt="4Vape B2B" className="auth-logo" />
          <h1>4Vape B2B</h1>
          <p>Accesso area amministrazione</p>
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <div className={`password-field ${showPassword ? "" : "smoke-on"}`}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "text"}
                className={showPassword ? "" : "smoke-pass"}
                required
              />
              <button
                type="button"
                className={`eye-btn ${showPassword ? "on" : ""}`}
                aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                <span className="eye-icon" aria-hidden="true" />
              </button>
            </div>
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn primary" disabled={loading}>
            {loading ? "Accesso..." : "Entra"}
          </button>
        </form>
      </div>
    </div>
  );
}
