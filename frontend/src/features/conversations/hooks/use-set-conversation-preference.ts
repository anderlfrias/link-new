"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { setConversationFavorite, setConversationPinned } from "@/features/conversations/api/conversations.api";

/** Fijar/favoritear un chat (`PATCH /:id/pin` / `/:id/favorite`, ver
 * backend/API.md 4.10/4.11). Sin actualización optimista local — dispara el
 * PATCH y confía en que `use-conversations.ts` refresque la lista al recibir
 * `conversation:member_preference_changed`, mismo criterio que el resto de
 * las mutaciones de este módulo (agregar/quitar miembro, admin de grupo). */
export function useSetConversationPreference() {
  const { session } = useAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setPinned = useCallback(
    async (conversationId: string, isPinned: boolean) => {
      if (!session) return false;
      setPendingId(conversationId);
      setError(null);
      try {
        await setConversationPinned(session.token, conversationId, isPinned);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el chat.");
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [session],
  );

  const setFavorite = useCallback(
    async (conversationId: string, isFavorite: boolean) => {
      if (!session) return false;
      setPendingId(conversationId);
      setError(null);
      try {
        await setConversationFavorite(session.token, conversationId, isFavorite);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar el chat.");
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [session],
  );

  return { setPinned, setFavorite, pendingId, error };
}
