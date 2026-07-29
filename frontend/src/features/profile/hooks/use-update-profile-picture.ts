"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { deleteProfilePicture, updateProfilePicture } from "@/features/auth/api/auth.api";

export function useUpdateProfilePicture() {
  const { session } = useAuth();
  const { refresh } = useProfilePicture();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (image: Blob, filename?: string) => {
      if (!session) return;
      setPending(true);
      setError(null);
      try {
        await updateProfilePicture(session.token, image, filename);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar la foto de perfil.");
      } finally {
        setPending(false);
      }
    },
    [session, refresh],
  );

  const remove = useCallback(async () => {
    if (!session) return;
    setPending(true);
    setError(null);
    try {
      await deleteProfilePicture(session.token);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la foto de perfil.");
    } finally {
      setPending(false);
    }
  }, [session, refresh]);

  return { upload, remove, pending, error };
}
