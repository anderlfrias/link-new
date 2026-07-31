"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { login as loginRequest } from "@/features/auth/api/auth.api";
import type { LoginCredentials, Session } from "@/features/auth/types/auth.types";
import { disconnectSocket } from "@/lib/socket-client";

const SESSION_STORAGE_KEY = "chat-interno:session";

type AuthStatus = "idle" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  session: Session | null;
  status: AuthStatus;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  /** Actualiza campos de `session.user` en memoria + localStorage (ej. tras
   * cambiar el propio nombre) — sin esto, el cambio no se vería hasta el
   * próximo login, porque `session.user` viene del JWT decodificado en ese
   * momento, no de un fetch en vivo a la base. */
  updateSessionUser: (patch: Partial<Session["user"]>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");

  useEffect(() => {
    const stored = readStoredSession();
    setSession(stored);
    setStatus(stored ? "authenticated" : "unauthenticated");
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await loginRequest(credentials);
    const nextSession: Session = { token: response.token, user: response.user };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const updateSessionUser = useCallback((patch: Partial<Session["user"]>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ session, status, login, logout, updateSessionUser }),
    [session, status, login, logout, updateSessionUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
}
