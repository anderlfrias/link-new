"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { MessageBubble } from "@/features/messages/components/MessageBubble";
import { TypingIndicator } from "@/features/messages/components/TypingIndicator";
import { formatDateSeparator } from "@/utils/format-date";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";
import type { MessagesStatus } from "@/features/messages/hooks/use-messages";
import type { ConversationType } from "@/features/conversations/types/conversation.types";

interface MessageListProps {
  conversationId?: string;
  messages: Message[];
  status: MessagesStatus;
  currentUserId: string;
  currentUserName?: string;
  conversationType: ConversationType;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  isTyping: boolean;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReplyMessage: (message: Message) => void;
  onForwardMessage: (message: Message) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onVotePoll?: (messageId: string, optionId: string) => Promise<void> | void;
  searchQuery?: string;
  searchJumpTarget?: { messageId: string; nonce: number } | null;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelectMessage?: (messageId: string) => void;
  onEnterSelectionMode?: (initialMessageId: string) => void;
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
  conversationId,
  messages,
  status,
  currentUserId,
  currentUserName,
  conversationType,
  hasMore,
  loadingMore,
  onLoadMore,
  isTyping,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
  onForwardMessage,
  onToggleReaction,
  onVotePoll,
  searchQuery,
  searchJumpTarget,
  isSelectionMode = false,
  selectedMessageIds,
  onToggleSelectMessage,
  onEnterSelectionMode,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);
  // Indica si el usuario desplazó conscientemente la vista hacia arriba para leer el historial.
  // Mientras sea false, cualquier cambio de tamaño (imágenes cargando, audio, fuentes, mensajes nuevos)
  // DEBE mantener la vista 100% clavada al fondo ("scroll completo sin importar qué").
  const userHasScrolledUpRef = useRef(false);
  const hasScrolledToBottomRef = useRef(false);

  // Si cambia el conversationId dentro de la misma instancia, reiniciar refs para evitar que
  // mensajes de la conversación previa interfieran con el cálculo de altura o anclaje.
  const prevConvIdRef = useRef(conversationId);
  if (prevConvIdRef.current !== conversationId) {
    prevConvIdRef.current = conversationId;
    prevFirstMessageIdRef.current = null;
    prevLastMessageIdRef.current = null;
    prevScrollHeightRef.current = 0;
    prevScrollTopRef.current = 0;
    isNearBottomRef.current = true;
    userHasScrolledUpRef.current = false;
    hasScrolledToBottomRef.current = false;
  }

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
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedId(messageId);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
  }

  useEffect(() => {
    if (searchJumpTarget?.messageId) {
      jumpToMessage(searchJumpTarget.messageId);
    }
  }, [searchJumpTarget]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = containerRef.current;
    if (!container) return;
    if (behavior === "smooth") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
      if (typeof messagesBottomRef.current?.scrollIntoView === "function") {
        messagesBottomRef.current.scrollIntoView({ behavior: "instant", block: "end" });
      }
    }
    userHasScrolledUpRef.current = false;
    isNearBottomRef.current = true;
    hasScrolledToBottomRef.current = true;
    setShowScrollBottom(false);
    setNewMessagesBelow(0);
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
  }, []);

  // Al estar listos los mensajes en la carga inicial, posicionar al fondo de forma inmediata
  // y re-confirmar con requestAnimationFrame y micro-timeouts para asegurar que cualquier
  // layout flex, fuentes o imágenes en caché queden completamente al fondo.
  useEffect(() => {
    if (status === "ready" && containerRef.current) {
      userHasScrolledUpRef.current = false;
      scrollToBottom("auto");
      const raf = requestAnimationFrame(() => {
        if (!userHasScrolledUpRef.current) {
          scrollToBottom("auto");
        }
      });
      const t1 = setTimeout(() => {
        if (!userHasScrolledUpRef.current) scrollToBottom("auto");
      }, 50);
      const t2 = setTimeout(() => {
        if (!userHasScrolledUpRef.current) scrollToBottom("auto");
      }, 200);
      const t3 = setTimeout(() => {
        if (!userHasScrolledUpRef.current) scrollToBottom("auto");
      }, 600);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [status, conversationId, scrollToBottom]);

  // Auto-scroll pinning: mientras el usuario no haya scrolleado voluntariamente hacia arriba,
  // cualquier cambio de tamaño (imágenes cargando, audio player, notas de voz, avatares, etc.)
  // debe mantener la vista 100% pegada al fondo.
  useEffect(() => {
    const target = contentRef.current;
    if (!target) return;

    function handlePinToBottom() {
      if (!userHasScrolledUpRef.current && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        if (typeof messagesBottomRef.current?.scrollIntoView === "function") {
          messagesBottomRef.current.scrollIntoView({ behavior: "instant", block: "end" });
        }
        prevScrollHeightRef.current = containerRef.current.scrollHeight;
        prevScrollTopRef.current = containerRef.current.scrollTop;
      }
    }

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handlePinToBottom);
      observer.observe(target);
    }

    // Capturar eventos load de imágenes/multimedia en fase de captura dentro del contenedor de mensajes
    target.addEventListener("load", handlePinToBottom, true);

    return () => {
      if (observer) observer.disconnect();
      target.removeEventListener("load", handlePinToBottom, true);
    };
  }, [status, conversationId]);

  // Anclaje de scroll en layout antes de que el navegador pinte el DOM
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;

    // Caso 1: Se cargaron mensajes anteriores al inicio del array (paginación hacia arriba)
    if (prevFirstMessageIdRef.current && firstId !== prevFirstMessageIdRef.current) {
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        container.scrollTop = prevScrollTopRef.current + heightDiff;
      }
    }
    // Caso 2: Nuevo mensaje agregado al final del array
    else if (prevLastMessageIdRef.current && lastId !== prevLastMessageIdRef.current) {
      if (!userHasScrolledUpRef.current) {
        scrollToBottom("auto");
      } else {
        setNewMessagesBelow((prev) => prev + 1);
      }
    }
    // Caso 3: Carga inicial de la conversación
    else if (!prevFirstMessageIdRef.current && status === "ready") {
      scrollToBottom("auto");
    }

    prevFirstMessageIdRef.current = firstId ?? null;
    prevLastMessageIdRef.current = lastId ?? null;
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
  }, [messages, status, scrollToBottom]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    isNearBottomRef.current = isNearBottom;

    // Solo consideramos que el usuario subió voluntariamente si:
    // 1. scrollTop se redujo respecto al frame anterior (desplazamiento hacia arriba, no simple crecimiento de scrollHeight).
    // 2. Está a más de STICK_TO_BOTTOM_THRESHOLD del fondo.
    const isScrollingUp = scrollTop < prevScrollTopRef.current - 5;
    if (isScrollingUp && distanceFromBottom > STICK_TO_BOTTOM_THRESHOLD) {
      userHasScrolledUpRef.current = true;
    } else if (distanceFromBottom <= 40) {
      // El usuario regresó al fondo: reactivar anclaje automático incondicional
      userHasScrolledUpRef.current = false;
    }

    prevScrollHeightRef.current = scrollHeight;
    prevScrollTopRef.current = scrollTop;

    // Mostrar botón flotante si el usuario subió más de 180px desde el fondo
    setShowScrollBottom(distanceFromBottom > 180);

    // Si vuelve cerca del fondo, resetear el contador de nuevos mensajes
    if (isNearBottom) {
      setNewMessagesBelow(0);
    }

    // Cargar mensajes más antiguos ÚNICAMENTE si:
    // 1. El usuario está navegando hacia arriba en el historial (userHasScrolledUpRef.current === true).
    // 2. El usuario se está desplazando HACIA ARRIBA en este scroll (isScrollingUp === true).
    // 3. El contenedor tiene altura real para scroll (scrollHeight > clientHeight + 10).
    // 4. Está cerca del tope (scrollTop < LOAD_MORE_THRESHOLD).
    // 5. Hay más mensajes en el servidor y no hay una petición en curso.
    const isScrollable = scrollHeight > clientHeight + 10;
    if (
      userHasScrolledUpRef.current &&
      isScrollingUp &&
      isScrollable &&
      scrollTop < LOAD_MORE_THRESHOLD &&
      hasMore &&
      !loadingMore &&
      messages.length > 0
    ) {
      onLoadMore();
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
    <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
        style={{
          ...chatBackgroundStyle,
          overflowAnchor: "auto",
        }}
      >
        <div ref={contentRef} className="space-y-2 min-w-0">
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

          const isSelected = Boolean(selectedMessageIds?.has(message.id));

          return (
            <div
              key={message.id}
              ref={(element) => {
                if (element) messageElementsRef.current.set(message.id, element);
                else messageElementsRef.current.delete(message.id);
              }}
              className={cn(
                "rounded-2xl transition-colors duration-200",
                highlightedId === message.id && "bg-brand-blue/10 dark:bg-brand-blue/15",
                isSelected && "bg-brand-blue/10 dark:bg-brand-blue/20",
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
                currentUserName={currentUserName}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onReply={onReplyMessage}
                onForward={onForwardMessage}
                onJumpToMessage={jumpToMessage}
                onToggleReaction={onToggleReaction}
                onVotePoll={onVotePoll}
                searchQuery={searchQuery}
                isSelectionMode={isSelectionMode}
                isSelected={isSelected}
                onToggleSelect={onToggleSelectMessage}
                onSelectFromMenu={onEnterSelectionMode}
              />
            </div>
          );
        })}

        {isTyping && (
          <div className="pt-1">
            <TypingIndicator />
          </div>
        )}

        {/* Centinela invisible al fondo para scrollIntoView y anclaje nativo */}
        <div
          ref={messagesBottomRef}
          aria-hidden="true"
          className="h-px w-full shrink-0 pointer-events-none"
          style={{ overflowAnchor: "auto" }}
        />
        </div>
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
          onClick={() => scrollToBottom("smooth")}
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
