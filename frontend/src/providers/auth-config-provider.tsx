"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAuthConfig } from "@/features/auth/api/auth.api";
import type { AuthConfig } from "@/features/auth/types/auth.types";

interface AuthConfigContextValue {
  /** `null` mientras carga o si el backend no respondió: los componentes muestran lo
   * mínimo (ver `useAuthCapabilities`). */
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
      // Sin respuesta, la app sigue igual: el login funciona y las secciones que
      // dependen del proveedor quedan ocultas hasta que haya configuración.
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

/** Lo que la interfaz necesita saber del proveedor de autenticación. Es la única forma
 * de decidir qué se muestra según el proveedor: nunca por su nombre o por el
 * `authProvider` de la sesión. Mientras no hay configuración, lo mínimo: sin cambio de
 * contraseña y con las cuentas de solo estado. */
export interface AuthCapabilities {
  /** `true` cuando llegó `GET /auth/config`. */
  loaded: boolean;
  /** Se puede cambiar la contraseña desde LINK (cuentas locales). */
  passwordChange: boolean;
  /** `full`: un admin crea y edita cuentas. `status-only`: solo activa o desactiva su acceso. */
  accountManagement: "full" | "status-only";
  /** Nombre visible del proveedor externo, o `null` con cuentas propias o sin configuración. */
  providerName: string | null;
}

export function deriveAuthCapabilities(config: AuthConfig | null): AuthCapabilities {
  return config
    ? {
        loaded: true,
        passwordChange: config.capabilities.passwordChange,
        accountManagement: config.capabilities.accountManagement,
        providerName: config.provider.external ? config.provider.displayName : null,
      }
    : { loaded: false, passwordChange: false, accountManagement: "status-only", providerName: null };
}

export function useAuthCapabilities(): AuthCapabilities {
  const { config } = useAuthConfig();
  return useMemo(() => deriveAuthCapabilities(config), [config]);
}
