"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { addMembers as addMembersRequest } from "@/features/conversations/api/conversations.api";

/** Agregar participantes a un grupo ya existente
 * (`POST /api/v1/conversations/:id/members`, ver backend/API.md sección 4.7).
 * El estado actualizado llega vía socket (`conversation:member_added`, ver
 * useConversation), así que acá no hace falta guardar el resultado. */
export function useAddMembers(conversationId: string) {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMembers = useCallback(
    async (userIds: string[]) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        await addMembersRequest(session.token, conversationId, userIds);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron agregar los participantes.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session, conversationId],
  );

  return { addMembers, pending, error };
}
