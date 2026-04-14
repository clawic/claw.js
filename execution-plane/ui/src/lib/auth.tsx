import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { api } from "./api";

type AuthState = {
  accessToken: string;
  tenantId: string;
  role: string;
  email: string;
  scopes: string[];
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  role: string;
  scopes: string[];
};

type AuthContextValue = {
  auth: AuthState | null;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readAuth(): AuthState | null {
  const accessToken = sessionStorage.getItem("accessToken");
  if (!accessToken) return null;
  return {
    accessToken,
    tenantId: sessionStorage.getItem("tenantId") ?? "",
    role: sessionStorage.getItem("role") ?? "",
    email: sessionStorage.getItem("email") ?? "",
    scopes: JSON.parse(sessionStorage.getItem("scopes") ?? "[]"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => readAuth());

  const login = useCallback(async (email: string, password: string, tenantId: string) => {
    const response = await api.post<LoginResponse>("/auth/login", { email, password, tenantId });
    sessionStorage.setItem("accessToken", response.accessToken);
    sessionStorage.setItem("refreshToken", response.refreshToken);
    sessionStorage.setItem("tenantId", response.tenantId);
    sessionStorage.setItem("role", response.role);
    sessionStorage.setItem("scopes", JSON.stringify(response.scopes));
    sessionStorage.setItem("email", email);
    setAuth({
      accessToken: response.accessToken,
      tenantId: response.tenantId,
      role: response.role,
      email,
      scopes: response.scopes,
    });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = sessionStorage.getItem("refreshToken");
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    }
    sessionStorage.clear();
    setAuth(null);
  }, []);

  const value = useMemo(() => ({ auth, login, logout }), [auth, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
