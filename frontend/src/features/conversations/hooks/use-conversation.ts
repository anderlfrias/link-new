"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { getConversation } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import type { Conversation } from "@/features/conversations/types/conversation.types";

export type ConversationDetailStatus = "idle" | "loading" | "ready" | "error";

export function useConversation(conversationId: string) {
  const { session } = useAuth();
  const { socket } = useSocket();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [status, setStatus] = useState<ConversationDetailStatus>("idle");

  useEffect(() => {
    if (!session) return;
    setStatus("loading");
    getConversation(session.token, conversationId)
      .then((data) => {
        setConversation(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [session, conversationId]);

  // Nombre/foto del grupo (use-update-conversation.ts) puede cambiar mientras
  // el detalle está abierto, por vos mismo o por otro miembro — el servidor
  // manda el objeto completo a la room de la conversación (la misma que
  // use-messages.ts ya une/deja para este mismo conversationId), así que
  // alcanza con reemplazar el estado local, no hace falta volver a pedirlo.
  useEffect(() => {
    if (!socket) return;
    function handleUpdated(updated: Conversation) {
      if (updated.id !== conversationId) return;
      setConversation(updated);
    }
    socket.on(SOCKET_EVENTS.conversation.updated, handleUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.conversation.updated, handleUpdated);
    };
  }, [socket, conversationId]);

  return { conversation, status };
}
