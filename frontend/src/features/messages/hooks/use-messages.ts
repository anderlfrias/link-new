"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { listMessages, sendMessage as sendMessageRequest } from "@/features/messages/api/messages.api";
import { markConversationRead } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import type { Message } from "@/features/messages/types/message.types";

export type MessagesStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 50;

export function useMessages(conversationId: string) {
  const { session } = useAuth();
  const { socket } = useSocket();
  const token = session?.token;

  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<MessagesStatus>("idle");
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Carga inicial + marcar como leído (ver backend/API.md sección 7).
  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    listMessages(token, conversationId, { limit: PAGE_SIZE })
      .then((data) => {
        setMessages(data);
        setHasMore(data.length === PAGE_SIZE);
        setStatus("ready");
        markConversationRead(token, conversationId).catch(() => {});
      })
      .catch(() => setStatus("error"));
  }, [token, conversationId]);

  // join/leave de la room — necesario para recibir message:* (ver backend/API.md sección 3.1).
  useEffect(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.conversation.join, conversationId);
    return () => {
      socket.emit(SOCKET_EVENTS.conversation.leave, conversationId);
    };
  }, [socket, conversationId]);

  useEffect(() => {
    if (!socket) return;

    function handleCreated(message: Message) {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (token) markConversationRead(token, conversationId).catch(() => {});
    }

    function handleUpdated(message: Message) {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    }

    function handleDeleted(payload: { conversationId: string; messageId: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    }

    socket.on(SOCKET_EVENTS.message.created, handleCreated);
    socket.on(SOCKET_EVENTS.message.updated, handleUpdated);
    socket.on(SOCKET_EVENTS.message.deleted, handleDeleted);
    return () => {
      socket.off(SOCKET_EVENTS.message.created, handleCreated);
      socket.off(SOCKET_EVENTS.message.updated, handleUpdated);
      socket.off(SOCKET_EVENTS.message.deleted, handleDeleted);
    };
  }, [socket, conversationId, token]);

  const loadMore = useCallback(() => {
    if (!token || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    listMessages(token, conversationId, { before: messages[0].id, limit: PAGE_SIZE })
      .then((older) => {
        setMessages((prev) => [...older, ...prev]);
        setHasMore(older.length === PAGE_SIZE);
      })
      .finally(() => setLoadingMore(false));
  }, [token, conversationId, messages, loadingMore, hasMore]);

  const send = useCallback(
    async (content: string, fileIds?: string[]) => {
      if (!token) return;
      const message = await sendMessageRequest(token, conversationId, { content, fileIds });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    },
    [token, conversationId],
  );

  return { messages, status, hasMore, loadingMore, loadMore, send };
}
