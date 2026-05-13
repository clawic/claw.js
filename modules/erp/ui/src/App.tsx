import { useState, useMemo, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { api } from "./api/client";
import { LoginPage } from "./pages/Login";
import { createAppRouter } from "./router";

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ctx = api.getContext();
    if (ctx.tenantId && ctx.legalEntityId) {
      setReady(true);
      return;
    }
    api.listTenants().then(({ tenants }) => {
      if (tenants.length === 0) {
        setReady(true);
        return;
      }
      const tenant = tenants[0];
      api.listLegalEntities(tenant.id).then(({ legalEntities }) => {
        if (legalEntities.length === 0) {
          setReady(true);
          return;
        }
        api.setContext(tenant.id, legalEntities[0].id);
        setReady(true);
      });
    }).catch(() => setReady(true));
  }, []);

  const router = useMemo(() => createAppRouter(onLogout), [onLogout]);

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="skeleton" style={{ width: 200, height: 24 }} />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export function App() {
  const { loggedIn, login, logout, loading, error } = useAuth();

  if (!loggedIn) {
    return <LoginPage onLogin={login} loading={loading} error={error} />;
  }

  return <AuthenticatedApp onLogout={logout} />;
}
