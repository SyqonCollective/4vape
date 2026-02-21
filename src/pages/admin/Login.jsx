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
          <div className="auth-sky" />
          <div className="auth-aurora" />
          <div className="auth-vignette" />
        </div>
        <div className="auth-clerk-shell">
          <section className="auth-clerk-brand">
            <div className="auth-badge">Pannello Logistica</div>
            <img src={logo} alt="4Vape B2B" className="auth-logo" />
            <h1>4Vape B2B Control</h1>
            <p>Accesso amministrativo sicuro con verifica account e ruoli aziendali.</p>
            <div className="auth-clerk-points">
              <span>Gestione ordini e logistica</span>
              <span>Controllo accessi aziende</span>
              <span>Audit e report centralizzati</span>
            </div>
          </section>
          <section className="auth-clerk-login">
            <div className="auth-clerk-title">
              <h2>Accedi</h2>
              <p>Usa un account già attivato. Se non entri, completa prima il link invito ricevuto via email.</p>
            </div>
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
                    border: "1px solid rgba(103, 137, 184, 0.28)",
                    background: "rgba(8, 13, 24, 0.74)",
                    borderRadius: "18px",
                    padding: "20px 20px 16px",
                  },
                  headerTitle: { display: "none" },
                  headerSubtitle: { display: "none" },
                  socialButtonsBlockButton: { borderRadius: "12px" },
                  formFieldInput: {
                    borderRadius: "12px",
                    background: "rgba(4, 9, 18, 0.88)",
                    border: "1px solid rgba(88, 118, 164, 0.42)",
                    color: "#e8eef9",
                    height: "46px",
                  },
                  formFieldLabel: {
                    color: "#cdd7ea",
                    fontSize: "13px",
                  },
                  formButtonPrimary: {
                    borderRadius: "12px",
                    height: "46px",
                    background: "linear-gradient(135deg, #1f7dff, #2bc4ff)",
                    fontWeight: 700,
                  },
                  footerActionText: { color: "#9db0cd" },
                  footerActionLink: { color: "#7ec8ff", pointerEvents: "none", opacity: 0.55 },
                  footer: { display: "none" },
                  identityPreviewText: { color: "#cdd7ea" },
                  formResendCodeLink: { color: "#7ec8ff" },
                  otpCodeFieldInput: {
                    borderRadius: "10px",
                    background: "rgba(4, 9, 18, 0.88)",
                    border: "1px solid rgba(88, 118, 164, 0.42)",
                    color: "#e8eef9",
                  },
                },
              }}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap auth-epic">
      <svg className="auth-filter" aria-hidden="true">
        <filter id="fog-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="18" />
        </filter>
      </svg>
      <div className="auth-scene">
        <AuthSmokeBackground />
        <div className="auth-sky" />
        <div className="auth-aurora" />
        <div className="auth-fog">
          <span className="fog f1" />
          <span className="fog f2" />
          <span className="fog f3" />
        </div>
        <div className="auth-noise" />
        <div className="auth-sparks">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={`spark s${i + 1}`} />
          ))}
        </div>
        <div className="auth-vignette" />
        <div className="auth-front-fog" />
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
