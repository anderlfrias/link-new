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

  // A diferencia de `updated` (objeto completo), este evento trae solo lo que
  // cambió — se aplica como patch local en vez de reemplazar todo el estado.
  useEffect(() => {
    if (!socket) return;
    function handleMemberAdminChanged(payload: { conversationId: string; userId: string; isAdmin: boolean }) {
      if (payload.conversationId !== conversationId) return;
      setConversation((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((member) =>
                member.userId === payload.userId ? { ...member, isAdmin: payload.isAdmin } : member,
              ),
            }
          : prev,
      );
    }
    socket.on(SOCKET_EVENTS.conversation.memberAdminChanged, handleMemberAdminChanged);
    return () => {
      socket.off(SOCKET_EVENTS.conversation.memberAdminChanged, handleMemberAdminChanged);
    };
  }, [socket, conversationId]);

  // A diferencia de `updated`/`memberAdminChanged`, este evento solo trae
  // `{conversationId, userIds}` (ver conversation.service.ts `addMembers`) —
  // no alcanza para parchear `members` localmente (falta el `ConversationMember`
  // completo de cada uno, con su `user` embebido), así que volvemos a pedir la
  // conversación entera. Corre para todos los que la tienen abierta, incluido
  // quien agregó (su propio socket también está en la room).
  useEffect(() => {
    if (!socket || !session) return;
    const token = session.token;
    function handleMemberAdded(payload: { conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      getConversation(token, conversationId)
        .then(setConversation)
        .catch(() => {});
    }
    socket.on(SOCKET_EVENTS.conversation.memberAdded, handleMemberAdded);
    return () => {
      socket.off(SOCKET_EVENTS.conversation.memberAdded, handleMemberAdded);
    };
  }, [socket, session, conversationId]);

  return { conversation, status };
}
