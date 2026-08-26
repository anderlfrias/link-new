"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { setMemberAdmin } from "@/features/conversations/api/conversations.api";

/** Promover/degradar a un miembro como admin de un grupo específico
 * (`PATCH /api/v1/conversations/:id/members/:userId/admin`, ver
 * backend/API.md sección 4.9). El estado actualizado llega vía socket
 * (`conversation:member_admin_changed`, ver `useConversation`), así que acá
 * no hace falta guardar el resultado. */
export function useSetMemberAdmin(conversationId: string) {
  const { session } = useAuth();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setAdmin = useCallback(
    async (userId: string, isAdmin: boolean) => {
      if (!session) return false;
      setPendingUserId(userId);
      setError(null);
      try {
        await setMemberAdmin(session.token, conversationId, userId, isAdmin);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el rol del miembro.");
        return false;
      } finally {
        setPendingUserId(null);
      }
    },
    [session, conversationId],
  );

  return { setAdmin, pendingUserId, error };
}
