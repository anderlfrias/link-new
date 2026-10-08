"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { login as loginRequest } from "@/features/auth/api/auth.api";
import type { LoginCredentials, Session } from "@/features/auth/types/auth.types";
import { disconnectSocket } from "@/lib/socket-client";
import { SESSION_EXPIRED_EVENT, setUnauthorizedHandler } from "@/lib/api-client";
import { SessionExpiredModal } from "@/features/auth/components/SessionExpiredModal";
import { teardownPushSubscription } from "@/features/notifications/utils/push-teardown";
import { migrateLegacyKey } from "@/lib/storage-keys";
import { ForcedPasswordChange } from "@/features/auth/components/ForcedPasswordChange";
import { useTranslation } from "@/i18n";

const SESSION_STORAGE_KEY = "link:session";
/** Clave anterior, de cuando la app se llamaba "Chat Interno": la sesión abierta se migra sola
 * (ver `migrateLegacyKey` en `lib/storage-keys.ts`). */
const LEGACY_SESSION_STORAGE_KEY = "chat-interno:session";

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
  /** Después de cambiar la propia contraseña (modo local): el token nuevo
   * reemplaza al actual, que el backend ya revocó, y el cambio obligatorio
   * queda resuelto. El socket reconecta solo, porque depende de `session`. */
  completePasswordChange: (token: string, exp: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface StoredSessionCheck {
  session: Session | null;
  wasExpired: boolean;
}

function checkStoredSession(): StoredSessionCheck {
  if (typeof window === "undefined") return { session: null, wasExpired: false };
  migrateLegacyKey(LEGACY_SESSION_STORAGE_KEY, SESSION_STORAGE_KEY);
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
  const routerRef = useRef(router);
  routerRef.current = router;
  const { setLocale } = useTranslation();

  const [session, setSession] = useState<Session | null>(null);
  // Espejo de `session` para que `logout` lea el token vigente sin cambiar de
  // identidad cada vez que la sesión se actualiza.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
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
      routerRef.current?.replace("/login");
    } catch {}
  }, []);

  useEffect(() => {
    const { session: stored, wasExpired } = checkStoredSession();
    if (wasExpired) {
      disconnectSocket();
      setSession(null);
      setStatus("unauthenticated");
      setIsSessionExpiredModalOpen(true);
      try {
        routerRef.current?.replace("/login");
      } catch {}
      return;
    }
    if (stored?.user?.language) {
      setLocale(stored.user.language);
    }
    setSession(stored);
    setStatus(stored ? "authenticated" : "unauthenticated");
  }, [setLocale]);

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

  useEffect(() => {
    if (!session?.user?.exp) return;

    const msUntilExpiry = session.user.exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      expireSession();
      return;
    }

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
    if (response.user.language) {
      setLocale(response.user.language);
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setStatus("authenticated");
    setIsSessionExpiredModalOpen(false);
  }, [setLocale]);

  const logout = useCallback(() => {
    // Dar de baja el push de este navegador antes de olvidar el token: sin esto,
    // en un equipo compartido las notificaciones (con el texto de los mensajes)
    // de la cuenta que salió seguirían apareciendo. Con el token ya vencido no se
    // llama al backend: un 401 ahí abriría el aviso de "sesión expirada" encima
    // de un cierre de sesión voluntario.
    const current = sessionRef.current;
    const tokenIsValid = current && (!current.user.exp || current.user.exp * 1000 > Date.now());
    void teardownPushSubscription(tokenIsValid ? current.token : null);

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

  const completePasswordChange = useCallback((token: string, exp: number) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: Session = {
        token,
        user: { ...prev.user, exp, mustChangePassword: false, mustChangePasswordReason: null },
      };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCloseSessionExpiredModal = useCallback(() => {
    setIsSessionExpiredModalOpen(false);
    try {
      routerRef.current?.replace("/login");
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ session, status, login, logout, updateSessionUser, expireSession, completePasswordChange }),
    [session, status, login, logout, updateSessionUser, expireSession, completePasswordChange],
  );

  return (
    <AuthContext.Provider value={value}>
      {/* Con un token restringido (cambio de contraseña obligatorio, LOCAL_AUTH_PLAN.md
          D13) la app no se monta: el resto de la API y el socket lo rechazarían. */}
      {session?.user.mustChangePassword ? <ForcedPasswordChange /> : children}
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

