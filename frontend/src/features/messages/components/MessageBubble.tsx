import { MouseEvent, useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconCornerUpLeft, IconLoader2, IconX } from "@tabler/icons-react";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { MessageAttachments } from "@/features/messages/components/MessageAttachments";
import { MessageOptionsMenu } from "@/features/messages/components/MessageOptionsMenu";
import { QuotedMessagePreview } from "@/features/messages/components/QuotedMessagePreview";
import { DeleteMessageConfirmModal } from "@/features/messages/components/DeleteMessageConfirmModal";
import { useMessageGestures } from "@/features/messages/hooks/use-message-gestures";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { aggregateMessageStatus } from "@/utils/message-status";
import { isWithinMessageTimeLimit } from "@/utils/message-edit-window";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  currentUserId: string;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReply: (message: Message) => void;
  onJumpToMessage: (messageId: string) => void;
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  isOwn,
  showSender,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onJumpToMessage,
}: MessageBubbleProps) {
  const settings = usePublicSettings();
  const isDeleted = Boolean(message.deletedAt);
  const status = isOwn ? aggregateMessageStatus(message.receipts) : null;
  const isEdited = Boolean(message.editedAt && !isDeleted);
  const hasCaption = isDeleted || Boolean(message.content.trim());
  const hasAttachments = !isDeleted && message.files.length > 0;

  // A diferencia de editar/eliminar (autoservicio sobre el propio mensaje),
  // responder está disponible sobre CUALQUIER mensaje ajeno o propio — el
  // creador de la conversación borrando un mensaje ajeno (moderación) no
  // tiene disparador en esta UI todavía, aunque el backend ya lo permite.
  const canReply = !isDeleted;
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
  const showOptionsTrigger = canReply || canEdit || canDelete;

  const [menuOpen, setMenuOpen] = useState(false);
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
    onLongPress: () => setMenuOpen(true),
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
  // abre el mismo menú que el botón "⋮" (Responder/Editar/Eliminar), en vez
  // del menú nativo del navegador. Nunca en mobile — ahí el long-press ya
  // cubre exactamente este mismo rol, y un `contextmenu` disparado por un
  // long-press táctil no debe interferir con ese gesto.
  function handleRowContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!showOptionsTrigger || isEditing) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    event.preventDefault();
    setMenuOpen(true);
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
        isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
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
      className={cn("relative flex", isOwn ? "justify-end" : "justify-start")}
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
          "group relative max-w-[75%] min-w-[80px] rounded-2xl px-3 py-2 shadow-sm",
          isOwn
            ? "bg-brand-blue text-white"
            : "bg-white text-brand-ink dark:bg-neutral-800 dark:text-white",
        )}
      >
        {showOptionsTrigger && !isEditing && (
          <div className={cn("absolute -top-1", isOwn ? "right-full mr-1" : "left-full ml-1")}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Opciones del mensaje"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-white/10"
            >
              <IconChevronDown size={14} stroke={2} />
            </button>
            <MessageOptionsMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              canReply={canReply}
              canEdit={canEdit}
              canDelete={canDelete}
              onReply={() => onReply(message)}
              onEdit={startEditing}
              onDelete={() => setDeleteModalOpen(true)}
              align={isOwn ? "right" : "left"}
            />
          </div>
        )}

        {message.replyTo && !isEditing && (
          <QuotedMessagePreview
            variant="bubble"
            isOwnBubble={isOwn}
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
        {hasAttachments && (
          <div className={hasCaption ? "mb-1.5" : undefined}>
            <MessageAttachments files={message.files} isOwn={isOwn} />
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
                isOwn ? "border-white/30 placeholder:text-white/60" : "border-black/10 dark:border-white/10",
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
              isDeleted && "italic text-neutral-400 dark:text-neutral-500",
              !isDeleted && !isOwn && "text-brand-ink dark:text-white",
            )}
          >
            {isDeleted ? "Mensaje eliminado" : message.content}
            <span className="float-right ml-2 mt-[3px]">{footer}</span>
          </p>
        ) : (
          <div className="flex justify-end">{footer}</div>
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
