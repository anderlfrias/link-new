"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { updateNotificationSoundPreference } from "@/features/auth/api/auth.api";

/** Activar/desactivar mi tono de notificación — 100% local (ver backend/API.md sección 2). */
export function useUpdateNotificationSound() {
  const { session, updateSessionUser } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        const updated = await updateNotificationSoundPreference(session.token, enabled);
        updateSessionUser({ notificationSoundEnabled: updated.notificationSoundEnabled });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar la preferencia.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, updateSessionUser],
  );

  return { setEnabled, pending, error };
}
