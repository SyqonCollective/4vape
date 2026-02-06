import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../../lib/api.js";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <div className="auth-wrap">
      <div className="auth-smoke">
        <span className="smoke s1" />
        <span className="smoke s2" />
        <span className="smoke s3" />
        <span className="smoke s4" />
        <span className="smoke s5" />
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
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
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
