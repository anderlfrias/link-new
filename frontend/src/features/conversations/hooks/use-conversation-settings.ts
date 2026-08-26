"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getConversationSettings } from "@/features/conversations/api/conversations.api";
import type { ConversationEffectiveSettings } from "@/features/conversations/types/group-settings.types";

export type ConversationSettingsStatus = "idle" | "loading" | "ready" | "error";

export function useConversationSettings(conversationId: string) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<ConversationEffectiveSettings | null>(null);
  const [status, setStatus] = useState<ConversationSettingsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!session) return;
    setStatus("loading");
    setError(null);
    getConversationSettings(session.token, conversationId)
      .then((data) => {
        setSettings(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración del grupo.");
        setStatus("error");
      });
  }, [session, conversationId, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { settings, status, error, refetch };
}
