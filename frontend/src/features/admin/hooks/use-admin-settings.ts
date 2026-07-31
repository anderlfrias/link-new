"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getAdminSettings } from "@/features/admin/api/admin-settings.api";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";

export type AdminSettingsStatus = "idle" | "loading" | "ready" | "error";

export function useAdminSettings() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [status, setStatus] = useState<AdminSettingsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!session) return;
    setStatus("loading");
    setError(null);
    getAdminSettings(session.token)
      .then((data) => {
        setSettings(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
        setStatus("error");
      });
  }, [session, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { settings, status, error, refetch };
}
