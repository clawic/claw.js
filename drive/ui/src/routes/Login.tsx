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
          <img src="/brand/logo.png" alt="ClawJS" width="32" height="32" />
          <span>
            Claw<strong>Wiki</strong>
          </span>
        </span>

        <h4 className="text-lg font-normal text-center mb-6">Sign in</h4>

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
            <p className="text-[13px] text-red bg-red/10 rounded px-3 py-2 mb-4">{error}</p>
          )}

          <button type="submit" className="wiki-btn" disabled={pending}>
            {pending ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
