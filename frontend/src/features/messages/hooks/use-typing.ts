"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/providers/socket-provider";
import { SOCKET_EVENTS } from "@/constants/socket-events";

const TYPING_STOP_DELAY_MS = 4000;

interface TypingPayload {
  conversationId: string;
  userId: string;
}

/** Ver backend/API.md sección 8 — 100% efímero, nunca se persiste. */
export function useTyping(conversationId: string) {
  const { socket } = useSocket();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    function handleStart({ conversationId: cid, userId }: TypingPayload) {
      if (cid !== conversationId) return;
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    }

    function handleStop({ conversationId: cid, userId }: TypingPayload) {
      if (cid !== conversationId) return;
      setTypingUserIds((prev) => prev.filter((id) => id !== userId));
    }

    socket.on(SOCKET_EVENTS.message.typingStart, handleStart);
    socket.on(SOCKET_EVENTS.message.typingStop, handleStop);
    return () => {
      socket.off(SOCKET_EVENTS.message.typingStart, handleStart);
      socket.off(SOCKET_EVENTS.message.typingStop, handleStop);
      setTypingUserIds([]);
    };
  }, [socket, conversationId]);

  const notifyTyping = useCallback(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.message.typingStart, conversationId);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      socket.emit(SOCKET_EVENTS.message.typingStop, conversationId);
    }, TYPING_STOP_DELAY_MS);
  }, [socket, conversationId]);

  const notifyStopped = useCallback(() => {
    if (!socket) return;
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    socket.emit(SOCKET_EVENTS.message.typingStop, conversationId);
  }, [socket, conversationId]);

  useEffect(
    () => () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    },
    [],
  );

  return { typingUserIds, notifyTyping, notifyStopped };
}
