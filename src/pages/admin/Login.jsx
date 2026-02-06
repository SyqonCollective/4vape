import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../../lib/api.js";

export default function AdminLogin() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      navigate("/admin/dashboard");
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
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">Admin</div>
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
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "text"}
                className={showPassword ? "" : "smoke-pass"}
                required
              />
              <button
                type="button"
                className="eye-btn"
                aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "🙈" : "👁"}
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
