"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getDraft, subscribeDraft } from "@/features/messages/lib/draft-store";

/**
 * Hook reactivo para obtener el borrador de una conversación.
 * Se suscribe a cambios en el draft-store para actualizar la UI en tiempo real.
 */
export function useDraft(conversationId: string, overrideUserId?: string): string {
  let sessionUserId = "";
  try {
    // Si se encuentra dentro de AuthProvider, lee la sesión actual
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const auth = useAuth();
    sessionUserId = auth.session?.user?.internalUserId || "";
  } catch {
    // Permitir ejecución en tests o componentes sin AuthProvider si se provee overrideUserId
  }
  const userId = overrideUserId || sessionUserId;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!userId || !conversationId) return () => {};
      return subscribeDraft(userId, conversationId, onStoreChange);
    },
    [userId, conversationId],
  );

  const getSnapshot = useCallback(() => {
    if (!userId || !conversationId) return "";
    return getDraft(userId, conversationId);
  }, [userId, conversationId]);

  const getServerSnapshot = useCallback(() => "", []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
