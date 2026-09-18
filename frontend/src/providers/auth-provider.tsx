"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { login as loginRequest } from "@/features/auth/api/auth.api";
import type { LoginCredentials, Session } from "@/features/auth/types/auth.types";
import { disconnectSocket } from "@/lib/socket-client";
import { SESSION_EXPIRED_EVENT, setUnauthorizedHandler } from "@/lib/api-client";
import { SessionExpiredModal } from "@/features/auth/components/SessionExpiredModal";

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
  /** Fuerza la expiración de la sesión actual, desconecta el socket, redirige a login
   * y despliega el modal informativo de sesión caducada. */
  expireSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface StoredSessionCheck {
  session: Session | null;
  wasExpired: boolean;
}

function checkStoredSession(): StoredSessionCheck {
  if (typeof window === "undefined") return { session: null, wasExpired: false };
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return { session: null, wasExpired: false };
  try {
    const parsed = JSON.parse(raw) as Session;
    // session.user.exp viene en segundos desde Unix epoch
    if (parsed?.user?.exp && parsed.user.exp * 1000 <= Date.now()) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return { session: null, wasExpired: true };
    }
    return { session: parsed, wasExpired: false };
  } catch {
    return { session: null, wasExpired: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [isSessionExpiredModalOpen, setIsSessionExpiredModalOpen] = useState(false);

  const expireSession = useCallback(() => {
    disconnectSocket();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setSession(null);
    setStatus("unauthenticated");
    setIsSessionExpiredModalOpen(true);
    try {
      router.replace("/login");
    } catch {
      // Si el router no está montado (ej. entorno de test aislado), no interrumpe
    }
  }, [router]);

  useEffect(() => {
    const { session: stored, wasExpired } = checkStoredSession();
    if (wasExpired) {
      disconnectSocket();
      setSession(null);
      setStatus("unauthenticated");
      setIsSessionExpiredModalOpen(true);
      try {
        router.replace("/login");
      } catch {}
      return;
    }
    setSession(stored);
    setStatus(stored ? "authenticated" : "unauthenticated");
  }, [router]);

  // Listener para eventos de 401 Unauthorized provenientes de apiRequest o sockets
  useEffect(() => {
    const handleExpired = () => {
      expireSession();
    };

    setUnauthorizedHandler(handleExpired);
    if (typeof window !== "undefined") {
      window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    }

    return () => {
      setUnauthorizedHandler(null);
      if (typeof window !== "undefined") {
        window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
      }
    };
  }, [expireSession]);

  // Temporizador para expirar la sesión proactivamente en vivo cuando el JWT caduque
  useEffect(() => {
    if (!session?.user?.exp) return;

    const msUntilExpiry = session.user.exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      expireSession();
      return;
    }

    // Límite seguro de 32 bits (~24.8 días) para setTimeout
    if (msUntilExpiry < 2147483647) {
      const timer = setTimeout(() => {
        expireSession();
      }, msUntilExpiry);
      return () => clearTimeout(timer);
    }
  }, [session, expireSession]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await loginRequest(credentials);
    const nextSession: Session = { token: response.token, user: response.user };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setStatus("authenticated");
    setIsSessionExpiredModalOpen(false);
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setStatus("unauthenticated");
    setIsSessionExpiredModalOpen(false);
  }, []);

  const updateSessionUser = useCallback((patch: Partial<Session["user"]>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCloseSessionExpiredModal = useCallback(() => {
    setIsSessionExpiredModalOpen(false);
    try {
      router.replace("/login");
    } catch {}
  }, [router]);

  const value = useMemo(
    () => ({ session, status, login, logout, updateSessionUser, expireSession }),
    [session, status, login, logout, updateSessionUser, expireSession],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionExpiredModal
        isOpen={isSessionExpiredModalOpen}
        onClose={handleCloseSessionExpiredModal}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
}

