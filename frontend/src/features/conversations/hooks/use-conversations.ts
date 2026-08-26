"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { listConversations } from "@/features/conversations/api/conversations.api";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";
import { SOCKET_EVENTS } from "@/constants/socket-events";

export type ConversationsStatus = "idle" | "loading" | "ready" | "error";

interface UseConversationsResult {
  conversations: ConversationListItem[];
  status: ConversationsStatus;
  refresh: () => void;
}

/**
 * El socket ya avisa en vivo (room personal `user:<id>`, ver backend/API.md sección 3.1)
 * cuando cambia algo en cualquiera de tus conversaciones. El refresh al enfocar la pestaña
 * es solo una red de contención por si el socket se cortó en silencio mientras tanto
 * (throttling de timers en background — ver el listener de "connect" más abajo).
 */
export function useConversations(): UseConversationsResult {
  const { session } = useAuth();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [status, setStatus] = useState<ConversationsStatus>("idle");

  const refresh = useCallback(() => {
    if (!session) return;
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    listConversations(session.token)
      .then((data) => {
        setConversations(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    const events = [
      SOCKET_EVENTS.conversation.created,
      SOCKET_EVENTS.conversation.updated,
      SOCKET_EVENTS.conversation.deleted,
      SOCKET_EVENTS.conversation.memberAdded,
      SOCKET_EVENTS.conversation.memberRemoved,
      SOCKET_EVENTS.conversation.memberPreferenceChanged,
      SOCKET_EVENTS.conversation.receiptUpdated,
      // Evento propio de socket.io (no de nuestro protocolo, por eso no está en
      // SOCKET_EVENTS): si el socket se cortó en silencio por throttling de
      // timers en background (ver use-messages.ts) y reconecta, puede haber
      // eventos que nunca llegaron — un refresh de más nunca rompe nada acá.
      "connect",
    ];
    events.forEach((event) => socket.on(event, refresh));
    return () => {
      events.forEach((event) => socket.off(event, refresh));
    };
  }, [socket, refresh]);

  return { conversations, status, refresh };
}
