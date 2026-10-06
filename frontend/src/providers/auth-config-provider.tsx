"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAuthConfig } from "@/features/auth/api/auth.api";
import type { AuthConfig } from "@/features/auth/types/auth.types";

interface AuthConfigContextValue {
  /** `null` mientras carga o si el backend no respondió: los componentes se
   * comportan como en modo external-auth, que es lo que hacían antes de que existiera. */
  config: AuthConfig | null;
  /** Vuelve a pedirla (ej. la pantalla de cambio obligatorio, por si un admin
   * cambió la política mientras tanto). */
  refresh: () => Promise<void>;
}

const AuthConfigContext = createContext<AuthConfigContextValue>({
  config: null,
  refresh: async () => {},
});

/** Pide `GET /auth/config` una vez al cargar la app (docs/design/LOCAL_AUTH_PLAN.md,
 * D14). Va fuera de `AuthProvider` porque el login la necesita antes de que
 * haya sesión, y no por `NEXT_PUBLIC_*`: esas quedan embebidas en el build, y
 * el backend tiene que ser la única fuente de verdad. */
export function AuthConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConfig(await getAuthConfig());
    } catch {
      // Sin respuesta, la app sigue igual: el login funciona en los dos modos
      // y las secciones del modo local se muestran según la sesión.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ config, refresh }), [config, refresh]);
  return <AuthConfigContext.Provider value={value}>{children}</AuthConfigContext.Provider>;
}

export function useAuthConfig(): AuthConfigContextValue {
  return useContext(AuthConfigContext);
}
