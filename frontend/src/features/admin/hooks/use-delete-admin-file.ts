"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { deleteAdminFile } from "@/features/admin/api/admin-files.api";

export function useDeleteAdminFile() {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        await deleteAdminFile(session.token, fileId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo eliminar el archivo.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session],
  );

  return { remove, pending, error };
}
