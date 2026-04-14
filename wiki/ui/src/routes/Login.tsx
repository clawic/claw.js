import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, auth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const from = location.state?.from?.pathname ?? "/main";

  const [email, setEmail] = useState("admin@localhost");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (auth) {
    navigate(from, { replace: true });
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="wiki-login-page">
      <div className="wiki-login-wrapper">
        <span className="wiki-login-brand">
          <div
            className="w-[24px] h-[24px] rounded flex items-center justify-center text-[12px] font-bold"
            style={{ background: "var(--color-text)", color: "var(--color-bg)" }}
          >
            C
          </div>
          <span>ClawJS Wiki</span>
        </span>

        <form onSubmit={onSubmit} className="w-full">
          <div className="wiki-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="wiki-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p
              className="text-[13px] rounded px-3 py-2 mb-3"
              style={{ color: "var(--color-red)", background: "rgba(235, 87, 87, 0.08)" }}
            >
              {error}
            </p>
          )}

          <button type="submit" className="wiki-btn" disabled={pending}>
            {pending ? "Signing in..." : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
