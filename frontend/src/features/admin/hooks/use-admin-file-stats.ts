"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getAdminFileStats } from "@/features/admin/api/admin-files.api";
import type { AdminFileStatsResponse } from "@/features/admin/types/admin-files.types";

export type AdminFileStatsStatus = "idle" | "loading" | "ready" | "error";

export function useAdminFileStats() {
  const { session } = useAuth();
  const [stats, setStats] = useState<AdminFileStatsResponse | null>(null);
  const [status, setStatus] = useState<AdminFileStatsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!session?.token) return;
    setStatus("loading");
    setError(null);
    getAdminFileStats(session.token)
      .then((data) => {
        setStats(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las estadísticas de archivos.");
        setStatus("error");
      });
  }, [session, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { stats, status, error, refetch };
}
