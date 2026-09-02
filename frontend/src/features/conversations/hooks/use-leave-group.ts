"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { removeMember } from "@/features/conversations/api/conversations.api";

/** "Salir del grupo" — `DELETE /:id/members/:userId` con el propio id (auto-remoción, ver
 * backend/API.md 4.6), siempre permitido para cualquier miembro de un GROUP, sin configuración.
 * Sin actualización optimista local, mismo criterio que `use-delete-conversation.ts`. */
export function useLeaveGroup() {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = useCallback(
    async (conversationId: string) => {
      if (!session) return false;
      setPending(true);
      setError(null);
      try {
        await removeMember(session.token, conversationId, session.user.internalUserId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo salir del grupo.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [session],
  );

  return { leave, pending, error };
}
