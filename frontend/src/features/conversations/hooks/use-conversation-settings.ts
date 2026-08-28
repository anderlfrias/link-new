"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getConversationSettings } from "@/features/conversations/api/conversations.api";
import type { ConversationEffectiveSettings } from "@/features/conversations/types/group-settings.types";

export type ConversationSettingsStatus = "idle" | "loading" | "ready" | "error";

/** `enabled` evita el fetch cuando todavía no corresponde llamarlo — el
 * backend rechaza `GET .../settings` para conversaciones PRIVATE (solo GROUP
 * tiene configuración de grupo), así que cualquier caller que no sepa de
 * antemano si la conversación es GROUP debe pasar `enabled: isGroup`. */
export function useConversationSettings(conversationId: string, enabled: boolean = true) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<ConversationEffectiveSettings | null>(null);
  const [status, setStatus] = useState<ConversationSettingsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!session || !enabled) return;
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
  }, [session, conversationId, enabled, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { settings, status, error, refetch };
}
