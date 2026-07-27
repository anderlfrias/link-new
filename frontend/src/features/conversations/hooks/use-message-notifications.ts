"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getConversationDisplayName, getLastMessagePreviewText } from "@/utils/conversation-display";
import { showNotification } from "@/utils/browser-notifications";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

/**
 * Notificación de escritorio cuando llega un mensaje nuevo en una conversación
 * que no tenés abierta (o la pestaña no está enfocada) — igual que WhatsApp
 * Desktop/Telegram. "Mensaje nuevo" se detecta comparando `lastMessageId`
 * contra el último visto por conversación, no `lastMessageAt`/`lastMessagePreview`
 * (esos también cambian al editar o borrar el último mensaje).
 */
export function useMessageNotifications(
  conversations: ConversationListItem[],
  currentUserId: string,
): void {
  const router = useRouter();
  const pathname = usePathname();
  const seenLastMessageId = useRef<Map<string, string | null>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    const seen = seenLastMessageId.current;

    if (!initialized.current) {
      // Primera carga: solo establece la base — no notifica mensajes que ya
      // existían antes de que la app estuviera abierta.
      conversations.forEach((conversation) => seen.set(conversation.id, conversation.lastMessageId));
      initialized.current = true;
      return;
    }

    conversations.forEach((conversation) => {
      const previousLastMessageId = seen.get(conversation.id);
      seen.set(conversation.id, conversation.lastMessageId);

      const isNewMessage =
        conversation.lastMessageId !== null && conversation.lastMessageId !== previousLastMessageId;
      const isOwnMessage = conversation.lastMessageSenderId === currentUserId;
      const isCurrentlyOpenAndFocused =
        pathname === `/conversations/${conversation.id}` &&
        document.visibilityState === "visible" &&
        document.hasFocus();

      if (!isNewMessage || isOwnMessage || isCurrentlyOpenAndFocused) return;

      showNotification({
        title: getConversationDisplayName(conversation, currentUserId),
        body: getLastMessagePreviewText(conversation, currentUserId),
        tag: conversation.id,
        onClick: () => router.push(`/conversations/${conversation.id}`),
      });
    });
  }, [conversations, currentUserId, pathname, router]);
}
