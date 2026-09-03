"use client";

import { useEffect, useRef } from "react";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";
import { playNotificationSound } from "@/utils/notification-sound";

/**
 * Suena un tono cuando `lastMessageId` de alguna conversación cambia a un
 * mensaje ajeno (no enviado por mí) — se apoya en el mismo refresh que ya
 * dispara `conversation:updated` (ver use-conversations.ts), así que cubre
 * tanto la conversación abierta como cualquier otra en segundo plano.
 *
 * No suena si ya estoy mirando esa conversación con la pestaña activa (mismo
 * criterio que WhatsApp/Telegram Web): en ese caso el mensaje ya se ve en
 * pantalla al instante, un tono ahí sería ruido de más.
 */
export function useNewMessageSound(
  conversations: ConversationListItem[],
  currentUserId: string,
  activeConversationId: string | null,
): void {
  const lastMessageIdsRef = useRef<Map<string, string | null> | null>(null);

  useEffect(() => {
    const previous = lastMessageIdsRef.current;
    const next = new Map(conversations.map((c) => [c.id, c.lastMessageId]));

    // Primera carga: solo establece la línea base, nunca suena por historial ya existente.
    if (previous) {
      const hasNewMessageFromOthers = conversations.some((conversation) => {
        if (conversation.lastMessageId == null) return false;
        if (conversation.lastMessageId === previous.get(conversation.id)) return false;
        if (conversation.lastMessageSenderId === currentUserId) return false;
        return document.hidden || conversation.id !== activeConversationId;
      });
      if (hasNewMessageFromOthers) playNotificationSound();
    }

    lastMessageIdsRef.current = next;
  }, [conversations, currentUserId, activeConversationId]);
}
