"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getPublicSettings } from "@/features/settings/api/public-settings.api";
import type { PublicAppSettings } from "@/features/settings/types/public-settings.types";

const PublicSettingsContext = createContext<PublicAppSettings | null>(null);

/**
 * Configuración global de solo lectura (`GET /v1/settings/public`), compartida
 * en un Provider en vez de un hook local porque varios componentes de mensajes
 * la necesitan a la vez (cada `MessageBubble` de la lista) — un fetch por
 * componente sería redundante y desincronizado si un admin la cambia mientras
 * la app está abierta en otra pestaña. Mismo patrón que `ProfilePictureProvider`.
 */
export function PublicSettingsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<PublicAppSettings | null>(null);

  useEffect(() => {
    if (!session) {
      setSettings(null);
      return;
    }

    let cancelled = false;
    getPublicSettings(session.token)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return <PublicSettingsContext.Provider value={settings}>{children}</PublicSettingsContext.Provider>;
}

/** `null` mientras carga o si falló — llamadores deben tratar eso como "sin
 * restricciones conocidas todavía" (ver MessageBubble, que oculta las
 * acciones de editar/borrar hasta tener esta configuración). */
export function usePublicSettings(): PublicAppSettings | null {
  return useContext(PublicSettingsContext);
}
