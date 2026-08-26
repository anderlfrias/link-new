"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { updateConversationSettings } from "@/features/conversations/api/conversations.api";
import type {
  ConversationEffectiveSettings,
  UpdateConversationSettingsPayload,
} from "@/features/conversations/types/group-settings.types";

export function useUpdateConversationSettings(conversationId: string) {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: UpdateConversationSettingsPayload): Promise<ConversationEffectiveSettings | null> => {
      if (!session) return null;
      setPending(true);
      setError(null);
      try {
        return await updateConversationSettings(session.token, conversationId, patch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la configuración del grupo.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [session, conversationId],
  );

  return { save, pending, error };
}
