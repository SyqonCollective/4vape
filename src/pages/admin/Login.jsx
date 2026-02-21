import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import { SignIn } from "@clerk/clerk-react";
import correctAnim from "../../assets/Correct.json";
import logo from "../../assets/logo.png";
import { api, setToken } from "../../lib/api.js";

export default function AdminLogin() {
  const clerkEnabled = Boolean(
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
  const navigate = useNavigate();
  const canvasRef = useRef(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let raf = 0;
    let width = 0;
    let height = 0;
    const particles = [];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    function seed() {
      particles.length = 0;
      const count = Math.min(140, Math.floor((width * height) / 12000));
      for (let i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.6 + Math.random() * 1.6,
          a: 0.12 + Math.random() * 0.4,
          vy: 0.1 + Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 0.25,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(210, 235, 255, 0.8)";
      for (const p of particles) {
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y -= p.vy;
        if (p.y < -20) p.y = height + 20;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      resize();
      seed();
    };

    onResize();
    draw();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (clerkEnabled) {
    return (
      <div className="auth-wrap auth-epic">
        <div className="auth-scene">
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
              <p>Inserisci email e password del tuo account approvato.</p>
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
                  footerActionLink: { color: "#7ec8ff" },
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
        <div className="auth-sky" />
        <div className="auth-aurora" />
        <div className="auth-fog">
          <span className="fog f1" />
          <span className="fog f2" />
          <span className="fog f3" />
        </div>
        <canvas ref={canvasRef} className="auth-canvas" />
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
