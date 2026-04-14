import { useState } from "react";
import { login } from "../api/client";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--c-bg)",
    }}>
      <div style={{ width: 360, padding: "var(--sp-8)" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--sp-8)" }}>
          <img src="/brand/logo.png" alt="ClawJS" style={{ width: 48, height: 48, borderRadius: "var(--r-md)", marginBottom: "var(--sp-3)" }} />
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Content</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)", marginTop: "var(--sp-1)" }}>
            Editorial workspace
          </p>
        </div>
        <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {error && <div className="error-block">{error}</div>}
          <div>
            <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn--primary w-full" disabled={loading} style={{ marginTop: "var(--sp-2)" }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
