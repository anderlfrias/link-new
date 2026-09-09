"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconChevronDown, IconLoader2 } from "@tabler/icons-react";
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
  onForwardMessage: (message: Message) => void;
}

const STICK_TO_BOTTOM_THRESHOLD = 120;
const LOAD_MORE_THRESHOLD = 140;
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
  onForwardMessage,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);

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

  // Al estar listos los mensajes en la carga inicial, posicionar al final
  useEffect(() => {
    if (status === "ready" && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      isNearBottomRef.current = true;
      setShowScrollBottom(false);
      setNewMessagesBelow(0);
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
      prevScrollTopRef.current = containerRef.current.scrollTop;
      prevFirstMessageIdRef.current = messages[0]?.id ?? null;
      prevLastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
    }
  }, [status]);

  // Anclaje de scroll en layout antes de que el navegador pinte el DOM
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;

    // Caso 1: Se cargaron mensajes anteriores al inicio del array
    if (prevFirstMessageIdRef.current && firstId !== prevFirstMessageIdRef.current) {
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        container.scrollTop = prevScrollTopRef.current + heightDiff;
      }
    }
    // Caso 2: Nuevo mensaje agregado al final del array
    else if (prevLastMessageIdRef.current && lastId !== prevLastMessageIdRef.current) {
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      } else {
        setNewMessagesBelow((prev) => prev + 1);
      }
    }
    // Caso 3: Carga inicial
    else if (!prevFirstMessageIdRef.current && status === "ready") {
      container.scrollTop = container.scrollHeight;
    }

    prevFirstMessageIdRef.current = firstId ?? null;
    prevLastMessageIdRef.current = lastId ?? null;
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
  }, [messages, status]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    isNearBottomRef.current = isNearBottom;

    prevScrollHeightRef.current = scrollHeight;
    prevScrollTopRef.current = scrollTop;

    // Mostrar botón flotante si el usuario subió más de 180px desde el fondo
    setShowScrollBottom(distanceFromBottom > 180);

    // Si vuelve cerca del fondo, resetear el contador de nuevos mensajes
    if (isNearBottom) {
      setNewMessagesBelow(0);
    }

    // Cargar mensajes más antiguos al llegar al umbral superior
    if (scrollTop < LOAD_MORE_THRESHOLD && hasMore && !loadingMore && messages.length > 0) {
      onLoadMore();
    }
  }

  function scrollToBottom() {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setNewMessagesBelow(0);
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
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
    <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
        style={chatBackgroundStyle}
      >
        {/* Indicador de inicio de la conversación */}
        {!hasMore && messages.length > 0 && (
          <div className="my-4 flex justify-center">
            <span className="rounded-full bg-black/5 dark:bg-white/10 px-3.5 py-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Inicio de la conversación
            </span>
          </div>
        )}

        {/* Indicador de carga de mensajes anteriores */}
        {loadingMore && (
          <div className="my-2 flex items-center justify-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <IconLoader2 className="h-4 w-4 animate-spin text-brand-blue" />
            <span>Cargando mensajes anteriores...</span>
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
                isSelfChat={conversationType === "SELF"}
                currentUserId={currentUserId}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onReply={onReplyMessage}
                onForward={onForwardMessage}
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

      {/* Botón flotante para bajar a los mensajes más recientes */}
      <div
        className={cn(
          "absolute bottom-4 right-6 z-10 transition-all duration-300 ease-out",
          showScrollBottom
            ? "opacity-100 translate-y-0 pointer-events-auto scale-100"
            : "opacity-0 translate-y-3 pointer-events-none scale-90",
        )}
      >
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Bajar a los mensajes más recientes"
          title="Bajar a los mensajes más recientes"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/95 dark:bg-neutral-800/95 text-neutral-700 dark:text-neutral-200 shadow-md hover:shadow-xl border border-neutral-200/80 dark:border-neutral-700 backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95 hover:text-brand-blue dark:hover:text-brand-blue-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <IconChevronDown size={22} stroke={2.2} />
          {newMessagesBelow > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-blue px-1.5 text-[11px] font-bold text-white shadow-md animate-scale-in">
              {newMessagesBelow > 99 ? "99+" : newMessagesBelow}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
