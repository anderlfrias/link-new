import { MouseEvent, useEffect, useRef, useState } from "react";
import {
  IconArrowForwardUp,
  IconCheck,
  IconChevronDown,
  IconCornerUpLeft,
  IconLoader2,
  IconMoodSmile,
  IconPhone,
  IconPhoneOff,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { MessageAttachments } from "@/features/messages/components/MessageAttachments";
import { MessageOptionsMenu } from "@/features/messages/components/MessageOptionsMenu";
import { QuotedMessagePreview } from "@/features/messages/components/QuotedMessagePreview";
import { DeleteMessageConfirmModal } from "@/features/messages/components/DeleteMessageConfirmModal";
import { QuickReactionPicker } from "@/features/messages/components/QuickReactionPicker";
import { MessageReactionsList } from "@/features/messages/components/MessageReactionsList";
import { useMessageGestures } from "@/features/messages/hooks/use-message-gestures";
import { useFavorites } from "@/features/messages/hooks/use-favorites";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { aggregateMessageStatus } from "@/utils/message-status";
import { isWithinMessageTimeLimit } from "@/utils/message-edit-window";
import { resolveFileUrl } from "@/utils/file-url";
import { copyImageToClipboard, copyTextToClipboard } from "@/utils/clipboard";
import { isImageMimeType } from "@/utils/file-format";
import { FormattedMessageText } from "@/features/messages/components/FormattedMessageText";
import { ContactMessageCard } from "@/features/messages/components/ContactMessageCard";
import { PollMessageCard } from "@/features/messages/components/PollMessageCard";
import { isMessageForwardable } from "@/features/messages/utils/message-forward";
import { cn } from "@/utils/cn";
import type { ContactMessagePayload, Message } from "@/features/messages/types/message.types";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  /** Solo importa para el estilo de un mensaje REENVIADO — ver `isFromOtherViaForward` abajo. */
  isSelfChat: boolean;
  currentUserId: string;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onVotePoll?: (messageId: string, optionId: string) => Promise<void> | void;
  searchQuery?: string;
  currentUserName?: string;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onSelectFromMenu?: (messageId: string) => void;
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  isOwn,
  showSender,
  isSelfChat,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onJumpToMessage,
  onToggleReaction,
  onVotePoll,
  searchQuery,
  currentUserName,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onSelectFromMenu,
}: MessageBubbleProps) {
  const settings = usePublicSettings();
  const isDeleted = Boolean(message.deletedAt);
  const isEdited = Boolean(message.editedAt && !isDeleted);
  const hasCaption = isDeleted || Boolean(message.content.trim());
  const hasAttachments = !isDeleted && message.files.length > 0;
  // Un sticker ya borrado se pinta como cualquier otro "Mensaje eliminado"
  // (tombstone genérico) — el look sin burbuja es solo para uno vivo.
  const isSticker = message.type === "STICKER" && !isDeleted;
  const isContact = message.type === "CONTACT" && !isDeleted;
  const isPoll = message.type === "POLL" && !isDeleted;
  const isCall = message.type === "CALL" && !isDeleted;
  const gifFile = !isDeleted ? message.files.find((f) => !f.file.deletedAt && f.file.mimeType === "image/gif") : null;
  const stickerFile = isSticker && message.files.length > 0 ? message.files[0].file : null;

  const { isFavoriteSticker, toggleFavoriteSticker, isFavoriteGif, toggleFavoriteGif } = useFavorites(currentUserId);
  const isFavSticker = stickerFile ? isFavoriteSticker(stickerFile.id) : false;
  const isFavGif = gifFile ? isFavoriteGif(gifFile.file.id) : false;

  const handleToggleFavoriteSticker = stickerFile
    ? () => {
        toggleFavoriteSticker({
          id: stickerFile.id,
          title: "Sticker",
          previewUrl: resolveFileUrl(stickerFile),
          fileId: stickerFile.id,
        });
      }
    : undefined;

  const handleToggleFavoriteGif = gifFile
    ? () => {
        toggleFavoriteGif({
          id: gifFile.file.id,
          title: gifFile.file.originalName || "GIF",
          previewUrl: resolveFileUrl(gifFile.file),
          originalUrl: resolveFileUrl(gifFile.file),
        });
      }
    : undefined;

  // `isOwn` (prop) = ¿el remitente REAL de este mensaje sos vos? Rige
  // permisos (canEdit/canDelete) y los recibos — nunca cambia por cómo se ve.
  // En tu propia conversación SELF, un mensaje reenviado que originalmente
  // mandó OTRA persona se pinta como si fuera un mensaje ajeno en un grupo
  // (burbuja a la izquierda, con su nombre arriba) aunque el remitente real
  // seas vos (sos el único miembro posible de tu propio chat) — así se ve de
  // un vistazo que ese contenido no lo escribiste vos. Si estás reenviando tu
  // PROPIO mensaje a tus mensajes guardados, no aplica: se ve como en
  // cualquier otro chat.
  const isFromOtherViaForward =
    isSelfChat && Boolean(message.forwardedFrom) && message.forwardedFrom!.senderId !== currentUserId;
  const renderAsOwn = isOwn && !isFromOtherViaForward;
  const status = isOwn ? aggregateMessageStatus(message.receipts) : null;

  // A diferencia de editar/eliminar (autoservicio sobre el propio mensaje),
  // responder/reenviar están disponibles sobre CUALQUIER mensaje ajeno o
  // propio — el creador de la conversación borrando un mensaje ajeno
  // (moderación) no tiene disparador en esta UI todavía, aunque el backend
  // ya lo permite.
  const canReply = !isDeleted;
  const canForward = isMessageForwardable(message);
  const canReact = !isDeleted && Boolean(onToggleReaction);
  const canEdit =
    isOwn &&
    !isDeleted &&
    message.type === "TEXT" &&
    Boolean(settings?.allowMessageEdit) &&
    isWithinMessageTimeLimit(message.createdAt, settings?.messageEditTimeLimitMinutes ?? null);
  const canDelete =
    isOwn &&
    !isDeleted &&
    Boolean(settings?.allowMessageDeleteForEveryone) &&
    isWithinMessageTimeLimit(message.createdAt, settings?.messageDeleteForEveryoneTimeLimitMinutes ?? null);
  const canCopyText = !isDeleted && Boolean(message.content.trim());
  const imageFiles = message.files.filter((f) => !f.file.deletedAt && isImageMimeType(f.file.mimeType));
  const canCopyImage = !isDeleted && (isSticker || imageFiles.length > 0);
  const showOptionsTrigger =
    canReply ||
    canForward ||
    canEdit ||
    canDelete ||
    canCopyText ||
    canCopyImage ||
    canReact ||
    Boolean(handleToggleFavoriteSticker) ||
    Boolean(handleToggleFavoriteGif);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextImageUrl, setContextImageUrl] = useState<string | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleContainerRef = useRef<HTMLDivElement>(null);

  const { handlers: gestureHandlers, swipeOffset, isSwiping } = useMessageGestures({
    disabled: isSelectionMode || !showOptionsTrigger,
    onLongPress: () => {
      setSelectedText(getSelectedTextInMessage());
      setAnchorPosition(null);
      setMenuOpen(true);
    },
    onSwipeReply: () => onReply(message),
  });

  // Desktop: la ruta real para responder es el menú (botón "⋮" o click derecho,
  // ver handleRowContextMenu) — esto de acá es solo un atajo extra para
  // usuarios avanzados, por eso no lleva cursor de mano ni reacciona a un
  // solo click, para no competir visualmente con la vía "real". Doble click
  // en cualquier parte de la FILA (no solo la burbujita — la fila ocupa todo
  // el ancho del hilo, aunque la burbuja sea angosta) selecciona para
  // responder. Se frena si el click fue sobre un elemento interactivo propio
  // (el menú "⋮", un adjunto, el editor) o si el usuario estaba
  // seleccionando texto (un click-and-drag para copiar también dispara esto al soltar).
  function handleRowDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (!canReply || isEditing) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    if (window.getSelection()?.toString()) return;
    onReply(message);
  }

  function getSelectedTextInMessage(): string | null {
    if (typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const text = selection.toString();
    if (!text.trim()) return null;

    if (bubbleContainerRef.current) {
      if (
        selection.anchorNode &&
        bubbleContainerRef.current.contains(selection.anchorNode)
      ) {
        return text;
      }
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (bubbleContainerRef.current.contains(range.commonAncestorContainer)) {
          return text;
        }
      }
    }
    return null;
  }

  // La vía "real" en desktop: click derecho en cualquier parte de la fila
  // abre el mismo menú que el botón "⋮" (Responder/Editar/Eliminar/Copiar), en vez
  // del menú nativo del navegador. Si se hizo click derecho sobre una imagen,
  // se memoriza su URL para copiar específicamente esa foto. Registra coordenadas
  // de pantalla para calcular que el cuadro no se salga de la pantalla ni genere scroll.
  function handleRowContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!showOptionsTrigger || isEditing) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const target = event.target as HTMLElement | null;
    // Si el usuario hace clic derecho sobre un enlace, dejamos que el navegador
    // muestre su menú nativo (copiar dirección de enlace, abrir en nueva pestaña, etc.)
    if (target?.closest("a")) return;
    event.preventDefault();
    const clickedImg = target?.closest("img");
    if (clickedImg?.src) {
      setContextImageUrl(clickedImg.src);
    } else {
      setContextImageUrl(null);
    }
    setSelectedText(getSelectedTextInMessage());
    setAnchorPosition({ x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }

  function getTargetImageUrl(): string | null {
    if (contextImageUrl) return contextImageUrl;
    if (isSticker && message.files[0]?.file) {
      return resolveFileUrl(message.files[0].file);
    }
    if (imageFiles.length > 0 && imageFiles[0]?.file) {
      return resolveFileUrl(imageFiles[0].file);
    }
    return null;
  }

  async function handleCopyText() {
    if (!message.content) return;
    let textToCopy = message.content;
    if (message.type === "CONTACT") {
      try {
        const parsed = JSON.parse(message.content) as ContactMessagePayload;
        textToCopy = parsed.username
          ? `Contacto: ${parsed.name} (@${parsed.username}) • ${parsed.email}`
          : `Contacto: ${parsed.name} • ${parsed.email}`;
      } catch {
        textToCopy = message.content;
      }
    } else if (message.type === "POLL" && message.poll) {
      const opts = message.poll.options.map((o) => `• ${o.text} (${o.voteCount})`).join("\n");
      textToCopy = `📊 Encuesta: ${message.poll.question}\n${opts}`;
    }
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      setCopiedFeedback(
        message.type === "CONTACT"
          ? "Contacto copiado al portapapeles"
          : message.type === "POLL"
            ? "Encuesta copiada al portapapeles"
            : "Texto copiado al portapapeles",
      );
      setTimeout(() => setCopiedFeedback(null), 2000);
    }
  }

  async function handleCopySelectedText(text: string) {
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedFeedback("Texto seleccionado copiado al portapapeles");
      setTimeout(() => setCopiedFeedback(null), 2000);
    }
  }

  async function handleCopyImage() {
    const url = getTargetImageUrl();
    if (!url) return;
    const ok = await copyImageToClipboard(url);
    if (ok) {
      setCopiedFeedback("Imagen copiada al portapapeles");
      setTimeout(() => setCopiedFeedback(null), 2000);
    }
  }

  useEffect(() => {
    if (isEditing) editTextareaRef.current?.focus();
  }, [isEditing]);

  function startEditing() {
    setEditValue(message.content);
    setEditError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditError(null);
  }

  async function submitEdit() {
    const content = editValue.trim();
    if (!content || content === message.content) {
      setIsEditing(false);
      return;
    }
    setEditPending(true);
    setEditError(null);
    try {
      await onEdit(message.id, content);
      setIsEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "No se pudo editar el mensaje.");
    } finally {
      setEditPending(false);
    }
  }

  async function confirmDelete() {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await onDelete(message.id);
      setDeleteModalOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "No se pudo eliminar el mensaje.");
    } finally {
      setDeletePending(false);
    }
  }

  const footer = (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px] select-none",
        renderAsOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
      )}
    >
      <span>{formatBubbleTime(message.createdAt)}</span>
      {isEdited && <span>· editado</span>}
      {status && <MessageStatusTicks status={status} tone="onBrand" />}
    </span>
  );

  return (
    // La fila entera es el área de click/swipe (no solo la burbujita) — así
    // no hace falta acertarle a una burbuja angosta para responder. La
    // burbuja en sí no cambia de tamaño ni posición, solo desliza visualmente
    // durante el swipe (ver `style` más abajo).
    <div
      {...(isSelectionMode ? {} : gestureHandlers)}
      onDoubleClick={isSelectionMode ? undefined : handleRowDoubleClick}
      onContextMenu={isSelectionMode ? undefined : handleRowContextMenu}
      onClick={isSelectionMode && !isDeleted ? () => onToggleSelect?.(message.id) : undefined}
      className={cn(
        "relative flex items-center transition-colors duration-150",
        renderAsOwn ? "justify-end" : "justify-start",
        isSelectionMode && !isDeleted && "cursor-pointer select-none",
      )}
    >
      {/* Indicador checkbox en modo selección (solo para mensajes vivos, no eliminados) */}
      {isSelectionMode && !isDeleted && (
        <div className={cn("flex shrink-0 items-center justify-center py-1", renderAsOwn ? "order-last pl-3" : "pr-3")}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(message.id);
            }}
            aria-label={isSelected ? "Deseleccionar mensaje" : "Seleccionar mensaje"}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-150",
              isSelected
                ? "border-brand-blue bg-brand-blue text-white shadow-sm scale-105"
                : "border-neutral-400/80 bg-white/50 hover:border-brand-blue dark:border-neutral-500 dark:bg-neutral-800/50",
            )}
          >
            {isSelected && <IconCheck size={13} stroke={3} />}
          </button>
        </div>
      )}

      {/* Ícono que se revela detrás de la burbuja al arrastrarla (swipe-to-reply,
          mobile) — mismo lenguaje visual que WhatsApp: aparece a la izquierda,
          se va marcando a medida que te acercás al umbral que dispara "responder". */}
      {swipeOffset > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/10 text-neutral-500 dark:bg-white/10 dark:text-neutral-400"
          style={{ opacity: Math.min(swipeOffset / 56, 1) }}
        >
          <IconCornerUpLeft size={16} stroke={2} />
        </div>
      )}
      <div
        style={{
          transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
          transition: isSwiping ? "none" : "transform 200ms ease-out",
        }}
        className={cn("flex flex-col", renderAsOwn ? "items-end" : "items-start", "max-w-[75%]")}
      >
        <div
          ref={bubbleContainerRef}
          className={cn(
            "group relative",
            isSticker
              ? "max-w-36"
              : cn(
                  "rounded-2xl px-3 py-2 shadow-sm",
                  isPoll
                    ? "min-w-[260px] sm:min-w-[300px] max-w-[360px]"
                    : isContact
                      ? "min-w-[240px] sm:min-w-[280px] max-w-[320px]"
                      : "min-w-[80px]",
                  renderAsOwn
                    ? "bg-brand-blue text-white"
                    : "bg-white text-brand-ink dark:bg-neutral-800 dark:text-white",
                ),
          )}
        >
        {copiedFeedback && (
          <div
            role="status"
            className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-neutral-900/90 px-4 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-sm dark:bg-white/95 dark:text-neutral-900"
          >
            <IconCheck size={14} stroke={2.5} className="text-emerald-400 dark:text-emerald-600" />
            <span>{copiedFeedback}</span>
          </div>
        )}
        {showOptionsTrigger && !isEditing && !isSelectionMode && (
          <div className={cn("absolute -top-1 flex items-center gap-0.5", renderAsOwn ? "right-full mr-1" : "left-full ml-1")}>
            {canReact && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setReactionPickerOpen((prev) => !prev)}
                  aria-label="Reaccionar al mensaje"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-white/10"
                >
                  <IconMoodSmile size={15} stroke={1.75} />
                </button>
                {reactionPickerOpen && (
                  <div className={cn("absolute z-30 bottom-full mb-1", renderAsOwn ? "right-0" : "left-0")}>
                    <QuickReactionPicker
                      onSelectEmoji={(emoji) => {
                        onToggleReaction?.(message.id, emoji);
                        setReactionPickerOpen(false);
                      }}
                      onClose={() => setReactionPickerOpen(false)}
                      align={renderAsOwn ? "right" : "left"}
                    />
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onMouseDown={() => {
                const currentSelected = getSelectedTextInMessage();
                setSelectedText(currentSelected);
              }}
              onClick={() => {
                const currentSelected = getSelectedTextInMessage();
                if (currentSelected) setSelectedText(currentSelected);
                setAnchorPosition(null);
                setMenuOpen((prev) => !prev);
              }}
              aria-label="Opciones del mensaje"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-white/10"
            >
              <IconChevronDown size={14} stroke={2} />
            </button>
            <MessageOptionsMenu
              open={menuOpen}
              onClose={() => {
                setMenuOpen(false);
                setAnchorPosition(null);
              }}
              anchorPosition={anchorPosition}
              canReply={canReply}
              canForward={canForward}
              canEdit={canEdit}
              canDelete={canDelete}
              canCopyText={canCopyText}
              canCopyImage={canCopyImage}
              selectedText={selectedText}
              onSelectReaction={canReact ? (emoji) => onToggleReaction!(message.id, emoji) : undefined}
              onReply={() => onReply(message)}
              onForward={() => onForward(message)}
              onEdit={startEditing}
              onDelete={() => setDeleteModalOpen(true)}
              onCopyText={() => void handleCopyText()}
              onCopySelectedText={(text) => void handleCopySelectedText(text)}
              onCopyImage={() => void handleCopyImage()}
              onSelect={onSelectFromMenu ? () => onSelectFromMenu(message.id) : undefined}
              onToggleFavoriteSticker={handleToggleFavoriteSticker}
              isFavoriteSticker={isFavSticker}
              onToggleFavoriteGif={handleToggleFavoriteGif}
              isFavoriteGif={isFavGif}
              align={renderAsOwn ? "right" : "left"}
            />
          </div>
        )}

        {message.forwardedFrom && !isEditing && (
          isFromOtherViaForward ? (
            // "Mensajes guardados" reenviado de OTRA persona: se atribuye,
            // mismo estilo que el nombre del remitente en un grupo — así se
            // ve de un vistazo que ese contenido no lo escribiste vos.
            <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-brand-teal-dark dark:text-brand-teal-light">
              <IconArrowForwardUp size={12} stroke={2} className="shrink-0" />
              <span className="truncate">{message.forwardedFrom!.senderName}</span>
            </p>
          ) : (
            // Cualquier otro destino (o reenviar tu propio mensaje a vos
            // mismo): solo se marca que es un reenvío, nunca a quién ni de
            // qué chat/grupo salió — ver ForwardedFromPreview en message.types.ts.
            <p
              className={cn(
                "mb-1 flex items-center gap-1 text-xs italic",
                renderAsOwn ? "text-white/70" : "text-neutral-500 dark:text-neutral-400",
              )}
            >
              <IconArrowForwardUp size={13} stroke={2} className="shrink-0" />
              <span>Reenviado</span>
            </p>
          )
        )}

        {message.replyTo && !isEditing && (
          <QuotedMessagePreview
            variant="bubble"
            isOwnBubble={renderAsOwn}
            senderName={message.replyTo.senderId === currentUserId ? "Vos" : message.replyTo.senderName}
            preview={message.replyTo.preview}
            isDeleted={Boolean(message.replyTo.deletedAt)}
            onClick={() => onJumpToMessage(message.replyTo!.id)}
          />
        )}

        {showSender && !isOwn && (
          <p className="mb-0.5 text-xs font-semibold text-brand-teal-dark dark:text-brand-teal-light">
            {message.sender.name}
          </p>
        )}
        {isSticker ? (
          <div className={cn("flex flex-col gap-1", renderAsOwn ? "items-end" : "items-start")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- tamaño intrínseco de sticker, no una foto de ancho completo */}
            <img
              src={resolveFileUrl(message.files[0].file)}
              alt="Sticker"
              className="h-36 w-36 object-contain"
            />
            <span className="flex items-center gap-1 px-0.5 text-[11px] text-neutral-400 select-none dark:text-neutral-500">
              <span>{formatBubbleTime(message.createdAt)}</span>
              {status && <MessageStatusTicks status={status} />}
            </span>
          </div>
        ) : isPoll && message.poll ? (
          <PollMessageCard
            poll={message.poll}
            isOwn={renderAsOwn}
            currentUserId={currentUserId}
            onVote={(optionId) => onVotePoll?.(message.id, optionId)}
            footer={footer}
          />
        ) : isContact ? (
          <ContactMessageCard
            rawContent={message.content}
            isOwn={renderAsOwn}
            currentUserId={currentUserId}
            footer={footer}
          />
        ) : isCall ? (
          <div className="flex flex-col gap-1 min-w-[200px]">
            <div className="flex items-center gap-2.5 py-1">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  message.content.toLowerCase().includes("perdida") ||
                    message.content.toLowerCase().includes("rechazada") ||
                    message.content.toLowerCase().includes("ocupado")
                    ? "bg-red-500/15 text-red-500"
                    : renderAsOwn
                      ? "bg-white/20 text-white"
                      : "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light",
                )}
              >
                {message.content.toLowerCase().includes("videollamada") ? (
                  <IconVideo size={20} />
                ) : message.content.toLowerCase().includes("perdida") ||
                  message.content.toLowerCase().includes("rechazada") ||
                  message.content.toLowerCase().includes("ocupado") ? (
                  <IconPhoneOff size={20} />
                ) : (
                  <IconPhone size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {message.content
                    .replace(/^[📞📹]\s*/u, "")
                    .replace(/\uFFFD/g, "")
                    .replace(/^[\uD800-\uDFFF]\s*/, "")
                    .trim() ||
                    (message.content.toLowerCase().includes("videollamada")
                      ? "Videollamada"
                      : "Llamada de voz")}
                </p>
                <p className="text-xs opacity-70">
                  {message.content.toLowerCase().includes("videollamada") ? "Videollamada" : "Llamada de voz"}
                </p>
              </div>
            </div>
            <div className="flex justify-end">{footer}</div>
          </div>
        ) : (
          <>
            {hasAttachments && (
              <div className={hasCaption ? "mb-1.5" : undefined}>
                <MessageAttachments files={message.files} isOwn={renderAsOwn} />
              </div>
            )}
            {isEditing ? (
              <div className="flex min-w-[180px] flex-col gap-1.5">
                <textarea
                  ref={editTextareaRef}
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitEdit();
                    }
                    if (event.key === "Escape") cancelEditing();
                  }}
                  rows={2}
                  className={cn(
                    "resize-none rounded-lg border bg-transparent px-2 py-1 text-sm outline-none",
                    renderAsOwn ? "border-white/30 placeholder:text-white/60" : "border-black/10 dark:border-white/10",
                  )}
                />
                {editError && <p className="text-xs text-red-300">{editError}</p>}
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={editPending}
                    aria-label="Cancelar edición"
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-50"
                  >
                    <IconX size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitEdit()}
                    disabled={editPending || !editValue.trim()}
                    aria-label="Guardar edición"
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-50"
                  >
                    {editPending ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
                  </button>
                </div>
              </div>
            ) : hasCaption ? (
              <p
                className={cn(
                  "flow-root whitespace-pre-wrap break-words text-sm",
                  isDeleted && (renderAsOwn ? "italic text-white/70" : "italic text-neutral-500 dark:text-neutral-400"),
                  !isDeleted && !renderAsOwn && "text-brand-ink dark:text-white",
                )}
              >
                {isDeleted ? (
                  "Mensaje eliminado"
                ) : (
                  <FormattedMessageText
                    content={message.content}
                    isOwn={renderAsOwn}
                    searchQuery={searchQuery}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                  />
                )}
                <span className="float-right ml-2 mt-[3px]">{footer}</span>
              </p>
            ) : (
              <div className="flex justify-end">{footer}</div>
            )}
          </>
        )}
        </div>

        {message.reactions && message.reactions.length > 0 && !isDeleted && (
          <MessageReactionsList
            reactions={message.reactions}
            currentUserId={currentUserId}
            onToggleReaction={(emoji) => onToggleReaction?.(message.id, emoji)}
            className={renderAsOwn ? "justify-end" : "justify-start"}
          />
        )}
      </div>

      {deleteModalOpen && (
        <DeleteMessageConfirmModal
          pending={deletePending}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setDeleteModalOpen(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
