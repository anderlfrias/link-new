"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { updateAdminSettings } from "@/features/admin/api/admin-settings.api";
import type { AdminSettings, UpdateAdminSettingsPayload } from "@/features/admin/types/admin-settings.types";

export function useUpdateAdminSettings() {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: UpdateAdminSettingsPayload): Promise<AdminSettings | null> => {
      if (!session) return null;
      setPending(true);
      setError(null);
      try {
        return await updateAdminSettings(session.token, patch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la configuración.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [session],
  );

  return { save, pending, error };
}
