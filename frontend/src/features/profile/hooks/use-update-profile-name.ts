"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { updateProfile } from "@/features/auth/api/auth.api";

/** Cambiar el propio nombre — 100% local (ver backend/API.md sección 2).
 * Actualiza `session.user.fullName` de una para que se refleje sin esperar
 * un nuevo login. */
export function useUpdateProfileName() {
  const { session, updateSessionUser } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateName = useCallback(
    async (name: string) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        const updated = await updateProfile(session.token, name);
        updateSessionUser({ fullName: updated.name });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el nombre.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, updateSessionUser],
  );

  return { updateName, pending, error };
}
