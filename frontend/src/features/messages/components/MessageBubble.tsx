import { MouseEvent, useEffect, useRef, useState } from "react";
import {
  IconArrowForwardUp,
  IconCheck,
  IconChevronDown,
  IconCornerUpLeft,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { MessageAttachments } from "@/features/messages/components/MessageAttachments";
import { MessageOptionsMenu } from "@/features/messages/components/MessageOptionsMenu";
import { QuotedMessagePreview } from "@/features/messages/components/QuotedMessagePreview";
import { DeleteMessageConfirmModal } from "@/features/messages/components/DeleteMessageConfirmModal";
import { useMessageGestures } from "@/features/messages/hooks/use-message-gestures";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { aggregateMessageStatus } from "@/utils/message-status";
import { isWithinMessageTimeLimit } from "@/utils/message-edit-window";
import { buildStoredFileUrl } from "@/utils/file-url";
import { copyImageToClipboard, copyTextToClipboard } from "@/utils/clipboard";
import { isImageMimeType } from "@/utils/file-format";
import { FormattedMessageText } from "@/features/messages/components/FormattedMessageText";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";

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
}: MessageBubbleProps) {
  const settings = usePublicSettings();
  const isDeleted = Boolean(message.deletedAt);
  const isEdited = Boolean(message.editedAt && !isDeleted);
  const hasCaption = isDeleted || Boolean(message.content.trim());
  const hasAttachments = !isDeleted && message.files.length > 0;
  // Un sticker ya borrado se pinta como cualquier otro "Mensaje eliminado"
  // (tombstone genérico) — el look sin burbuja es solo para uno vivo.
  const isSticker = message.type === "STICKER" && !isDeleted;

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
  const canForward = !isDeleted;
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
    canReply || canForward || canEdit || canDelete || canCopyText || canCopyImage;

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextImageUrl, setContextImageUrl] = useState<string | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { handlers: gestureHandlers, swipeOffset, isSwiping } = useMessageGestures({
    disabled: !showOptionsTrigger,
    onLongPress: () => {
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
    setAnchorPosition({ x: event.clientX, y: event.clientY });
    setMenuOpen(true);
  }

  function getTargetImageUrl(): string | null {
    if (contextImageUrl) return contextImageUrl;
    if (isSticker && message.files[0]?.file?.path) {
      return buildStoredFileUrl(message.files[0].file.path);
    }
    if (imageFiles.length > 0 && imageFiles[0]?.file?.path) {
      return buildStoredFileUrl(imageFiles[0].file.path);
    }
    return null;
  }

  async function handleCopyText() {
    if (!message.content) return;
    const ok = await copyTextToClipboard(message.content);
    if (ok) {
      setCopiedFeedback("Texto copiado al portapapeles");
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
      {...gestureHandlers}
      onDoubleClick={handleRowDoubleClick}
      onContextMenu={handleRowContextMenu}
      className={cn("relative flex", renderAsOwn ? "justify-end" : "justify-start")}
    >
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
        className={cn(
          "group relative",
          isSticker
            ? "max-w-36"
            : cn(
                "max-w-[75%] min-w-[80px] rounded-2xl px-3 py-2 shadow-sm",
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
        {showOptionsTrigger && !isEditing && (
          <div className={cn("absolute -top-1", renderAsOwn ? "right-full mr-1" : "left-full ml-1")}>
            <button
              type="button"
              onClick={() => {
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
              onReply={() => onReply(message)}
              onForward={() => onForward(message)}
              onEdit={startEditing}
              onDelete={() => setDeleteModalOpen(true)}
              onCopyText={() => void handleCopyText()}
              onCopyImage={() => void handleCopyImage()}
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
              src={buildStoredFileUrl(message.files[0].file.path)}
              alt="Sticker"
              className="h-36 w-36 object-contain"
            />
            <span className="flex items-center gap-1 px-0.5 text-[11px] text-neutral-400 select-none dark:text-neutral-500">
              <span>{formatBubbleTime(message.createdAt)}</span>
              {status && <MessageStatusTicks status={status} />}
            </span>
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
                  <FormattedMessageText content={message.content} isOwn={renderAsOwn} />
                )}
                <span className="float-right ml-2 mt-[3px]">{footer}</span>
              </p>
            ) : (
              <div className="flex justify-end">{footer}</div>
            )}
          </>
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
