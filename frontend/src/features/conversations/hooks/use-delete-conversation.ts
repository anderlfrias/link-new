"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { deleteConversation } from "@/features/conversations/api/conversations.api";

/** `DELETE /:id` (ver backend/API.md 4.7) — sirve tanto para "Eliminar chat" (PRIVATE, se oculta
 * solo para quien la borra) como "Eliminar grupo" (GROUP, para todos): mismo endpoint, la
 * diferencia de comportamiento vive enteramente en el backend. Sin actualización optimista local
 * — dispara el DELETE y confía en que `use-conversations.ts` refresque la lista al recibir el
 * evento de socket correspondiente, mismo criterio que `use-set-conversation-preference.ts`. */
export function useDeleteConversation() {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    async (conversationId: string) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        await deleteConversation(session.token, conversationId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo eliminar la conversación.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session],
  );

  return { remove, pending, error };
}
