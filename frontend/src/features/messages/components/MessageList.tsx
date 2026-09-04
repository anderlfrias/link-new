"use client";

import { useEffect, useRef, useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { MessageBubble } from "@/features/messages/components/MessageBubble";
import { TypingIndicator } from "@/features/messages/components/TypingIndicator";
import { formatDateSeparator } from "@/utils/format-date";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";
import type { MessagesStatus } from "@/features/messages/hooks/use-messages";
import type { ConversationType } from "@/features/conversations/types/conversation.types";

interface MessageListProps {
  messages: Message[];
  status: MessagesStatus;
  currentUserId: string;
  conversationType: ConversationType;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  isTyping: boolean;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReplyMessage: (message: Message) => void;
}

const STICK_TO_BOTTOM_THRESHOLD = 120;
const LOAD_MORE_THRESHOLD = 80;
/** Cuánto queda "encendida" la burbuja al saltar a un mensaje citado (ver `jumpToMessage`) — suficiente para que el ojo la encuentre sin sentirse pegajoso. */
const HIGHLIGHT_DURATION_MS = 1500;

/** Fondo del hilo — patrón propio de Link (ver globals.css / public/chat-pattern-*.svg),
 * mismo espíritu que el wallpaper de WhatsApp/Telegram. Vía CSS vars (no clases Tailwind)
 * porque el modo oscuro acá es manual (clase `.dark`), no `prefers-color-scheme`. */
const chatBackgroundStyle = {
  backgroundImage: "var(--chat-pattern-image)",
  backgroundColor: "var(--chat-pattern-bg)",
  backgroundRepeat: "repeat",
} as const;

export function MessageList({
  messages,
  status,
  currentUserId,
  conversationType,
  hasMore,
  loadingMore,
  onLoadMore,
  isTyping,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const messageElementsRef = useRef(new Map<string, HTMLDivElement>());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saltar al mensaje citado desde una respuesta (ver MessageBubble) — solo
  // funciona si ya está cargado en este hilo; si es más viejo que lo que se
  // paginó hasta ahora, no hay a dónde saltar todavía (habría que pedir más
  // historial primero, no implementado). `scrollIntoView` + un resalte
  // temporal es el mismo patrón que WhatsApp/Telegram usan para esto.
  function jumpToMessage(messageId: string) {
    const element = messageElementsRef.current.get(messageId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedId(messageId);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
  }

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grew = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (grew && stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (status === "ready" && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [status]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;

    if (container.scrollTop < LOAD_MORE_THRESHOLD && hasMore && !loadingMore) {
      const previousHeight = container.scrollHeight;
      onLoadMore();
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight - previousHeight;
        }
      });
    }
  }

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center" style={chatBackgroundStyle}>
        <IconLoader2 className="animate-spin text-brand-blue" size={24} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400"
        style={chatBackgroundStyle}
      >
        No se pudieron cargar los mensajes.
      </div>
    );
  }

  let lastDateKey = "";

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-w-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
      style={chatBackgroundStyle}
    >
      {loadingMore && (
        <div className="flex justify-center py-2">
          <IconLoader2 className="animate-spin text-brand-blue" size={18} />
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Todavía no hay mensajes. Escribí el primero.
        </div>
      )}

      {messages.map((message, index) => {
        const dateKey = new Date(message.createdAt).toDateString();
        const showDateSeparator = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        const previousMessage = messages[index - 1];
        const isOwn = message.senderId === currentUserId;
        const showSender =
          conversationType === "GROUP" &&
          !isOwn &&
          (showDateSeparator || previousMessage?.senderId !== message.senderId);

        return (
          <div
            key={message.id}
            ref={(element) => {
              if (element) messageElementsRef.current.set(message.id, element);
              else messageElementsRef.current.delete(message.id);
            }}
            className={cn(
              "rounded-2xl transition-colors duration-300",
              highlightedId === message.id && "bg-brand-blue/10 dark:bg-brand-blue/15",
            )}
          >
            {showDateSeparator && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                  {formatDateSeparator(message.createdAt)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showSender={showSender}
              currentUserId={currentUserId}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
              onReply={onReplyMessage}
              onJumpToMessage={jumpToMessage}
            />
          </div>
        );
      })}

      {isTyping && (
        <div className="pt-1">
          <TypingIndicator />
        </div>
      )}
    </div>
  );
}
