"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { updateConversation } from "@/features/conversations/api/conversations.api";
import type { UpdateConversationInput } from "@/features/conversations/types/conversation.types";

/** Renombrar / cambiar la foto de un grupo (`PATCH /api/v1/conversations/:id`,
 * ver backend/API.md sección 4). El objeto actualizado llega solo (y a
 * cualquier otro miembro mirando el mismo detalle) vía el socket — ver
 * `useConversation` —, así que acá no hace falta guardar el resultado. */
export function useUpdateConversation(conversationId: string) {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (input: UpdateConversationInput) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        await updateConversation(session.token, conversationId, input);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el grupo.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, conversationId],
  );

  return { update, pending, error };
}
