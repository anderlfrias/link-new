"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import {
  deleteMessage as deleteMessageRequest,
  editMessage as editMessageRequest,
  listMessages,
  sendMessage as sendMessageRequest,
} from "@/features/messages/api/messages.api";
import { markConversationRead } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import type { Message } from "@/features/messages/types/message.types";
import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";

export type MessagesStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 50;

interface ReceiptUpdatedPayload {
  conversationId: string;
  userId: string;
  kind: "read" | "delivered";
  messageId: string | null;
  at: string | null;
}

const RECEIPT_RANK: Record<MessageReceiptStatus, number> = { sent: 0, delivered: 1, read: 2 };

// Avanza el recibo de `userId` en un mensaje al recibir `conversation:receipt_updated`
// (ver backend/API.md sección 7). El watermark es "leído/entregado hasta la fecha X",
// así que cubre TODOS los mensajes con createdAt <= at, no solo el último — y nunca
// retrocede un recibo ya en "read" a "delivered" si llega un evento viejo desordenado.
function advanceReceipt(message: Message, payload: ReceiptUpdatedPayload): Message {
  if (!payload.at || message.senderId === payload.userId || message.createdAt > payload.at) {
    return message;
  }

  const nextStatus: MessageReceiptStatus = payload.kind;
  const existing = message.receipts.find((receipt) => receipt.userId === payload.userId);
  if (existing) {
    if (RECEIPT_RANK[existing.status] >= RECEIPT_RANK[nextStatus]) return message;
    return {
      ...message,
      receipts: message.receipts.map((receipt) =>
        receipt.userId === payload.userId ? { ...receipt, status: nextStatus } : receipt,
      ),
    };
  }

  return { ...message, receipts: [...message.receipts, { userId: payload.userId, status: nextStatus }] };
}

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

  // El socket puede desconectarse en silencio si Chrome tira los timers de la
  // pestaña en segundo plano (el heartbeat de Socket.IO depende de setTimeout,
  // que Chrome throttlea cuando la pestaña no está enfocada/visible) — nada
  // avisa que se cortó, así que el hilo abierto puede quedarse sin enterarse
  // de mensajes nuevos hasta que pasa algo. Al reconectar o al recuperar el
  // foco, volvemos a pedir la página más reciente y mergeamos lo que falte —
  // mismo patrón que ya usa useConversations con el focus de la ventana.
  const refreshLatest = useCallback(() => {
    if (!token) return;
    listMessages(token, conversationId, { limit: PAGE_SIZE })
      .then((latest) => {
        setMessages((prev) => {
          const knownIds = new Set(prev.map((m) => m.id));
          const fresh = latest.filter((m) => !knownIds.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        markConversationRead(token, conversationId).catch(() => {});
      })
      .catch(() => {});
  }, [token, conversationId]);

  useEffect(() => {
    if (!socket) return;
    socket.on("connect", refreshLatest);
    window.addEventListener("focus", refreshLatest);
    return () => {
      socket.off("connect", refreshLatest);
      window.removeEventListener("focus", refreshLatest);
    };
  }, [socket, refreshLatest]);

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

    function handleDeleted(payload: { conversationId: string; messageId: string; deletedAt: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, deletedAt: payload.deletedAt, content: "", files: [] } : m,
        ),
      );
    }

    function handleReceiptUpdated(payload: ReceiptUpdatedPayload) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((message) => advanceReceipt(message, payload)));
    }

    socket.on(SOCKET_EVENTS.message.created, handleCreated);
    socket.on(SOCKET_EVENTS.message.updated, handleUpdated);
    socket.on(SOCKET_EVENTS.message.deleted, handleDeleted);
    socket.on(SOCKET_EVENTS.conversation.receiptUpdated, handleReceiptUpdated);
    return () => {
      socket.off(SOCKET_EVENTS.message.created, handleCreated);
      socket.off(SOCKET_EVENTS.message.updated, handleUpdated);
      socket.off(SOCKET_EVENTS.message.deleted, handleDeleted);
      socket.off(SOCKET_EVENTS.conversation.receiptUpdated, handleReceiptUpdated);
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
    async (content: string, fileIds?: string[], replyToId?: string) => {
      if (!token) return;
      const message = await sendMessageRequest(token, conversationId, { content, fileIds, replyToId });
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    },
    [token, conversationId],
  );

  // El propio socket que emitió el PATCH/DELETE también recibe message:updated/
  // deleted de vuelta por estar en la room de la conversación (ver
  // handleUpdated/handleDeleted arriba) — actualizar acá igual no duplica nada
  // porque ambos caminos son idempotentes (reemplazar/parchear por id).
  const edit = useCallback(
    async (messageId: string, content: string) => {
      if (!token) return;
      const updated = await editMessageRequest(token, conversationId, messageId, { content });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    },
    [token, conversationId],
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!token) return;
      const result = await deleteMessageRequest(token, conversationId, messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deletedAt: result.deletedAt, content: "", files: [] } : m)),
      );
    },
    [token, conversationId],
  );

  return { messages, status, hasMore, loadingMore, loadMore, send, edit, remove };
}
