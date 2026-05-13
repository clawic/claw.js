import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export type AuthState = {
  accessToken: string;
  email: string;
};

type LoginResponse = {
  accessToken: string;
  admin: { id: string; email: string };
};

type AuthContextValue = {
  auth: AuthState | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readAuthFromStorage(): AuthState | null {
  const accessToken = sessionStorage.getItem("accessToken");
  if (!accessToken) return null;
  return {
    accessToken,
    email: sessionStorage.getItem("email") ?? "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => readAuthFromStorage());

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponse>("/auth/admin/login", { email, password });
    sessionStorage.setItem("accessToken", data.accessToken);
    sessionStorage.setItem("email", email);
    setAuth({ accessToken: data.accessToken, email });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.clear();
    setAuth(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, login, logout }),
    [auth, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
