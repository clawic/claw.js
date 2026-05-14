const ERP_TENANT_STORAGE_KEY = ERP_TENANT_STORAGE_KEY;
const ERP_ENTITY_STORAGE_KEY = ERP_ENTITY_STORAGE_KEY;
import { useState, useCallback, useEffect } from "react";
import { api } from "../api/client";

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(() => !!api.getToken());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await api.login(email, password);
      api.setToken(accessToken);
      setLoggedIn(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    localStorage.removeItem(ERP_TENANT_STORAGE_KEY);
    localStorage.removeItem(ERP_ENTITY_STORAGE_KEY);
    setLoggedIn(false);
  }, []);

  return { loggedIn, login, logout, loading, error };
}

export function useContextSetup() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ctx = api.getContext();
    if (ctx.tenantId && ctx.legalEntityId) {
      setReady(true);
      return;
    }
    api.listTenants().then(({ tenants }) => {
      if (tenants.length === 0) return;
      const tenant = tenants[0];
      api.listLegalEntities(tenant.id).then(({ legalEntities }) => {
        if (legalEntities.length === 0) return;
        api.setContext(tenant.id, legalEntities[0].id);
        setReady(true);
      });
    }).catch(() => {});
  }, []);

  return ready;
}
