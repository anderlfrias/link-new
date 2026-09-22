"use client";

import { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconFileText,
  IconHeadphones,
  IconLoader2,
  IconMicrophone,
  IconMoodPlus,
  IconPaperclip,
  IconPhoto,
  IconSend2,
  IconTrash,
  IconUser,
  IconVideo,
  type TablerIcon,
} from "@tabler/icons-react";
import { AttachmentErrorModal } from "@/features/messages/components/AttachmentErrorModal";
import { AttachmentPreviewChip } from "@/features/messages/components/AttachmentPreviewChip";
import { EmojiGifStickerPicker } from "@/features/messages/components/EmojiGifStickerPicker";
import { MentionAutocompleteList, type MentionCandidate } from "@/features/messages/components/MentionAutocompleteList";
import { QuotedMessagePreview } from "@/features/messages/components/QuotedMessagePreview";
import { ResumableUploadBanner } from "@/features/messages/components/ResumableUploadBanner";
import { ShareContactModal } from "@/features/messages/components/ShareContactModal";
import { importGiphyAsset } from "@/features/giphy/api/giphy.api";
import type { GiphyMediaKind } from "@/features/giphy/types/giphy.types";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { useVoiceRecorder } from "@/features/messages/hooks/use-voice-recorder";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { formatDuration } from "@/utils/format-duration";
import { buildMessagePreview } from "@/utils/message-preview";
import { extractFilesFromClipboard } from "@/utils/clipboard";
import { getActiveMentionQuery, type ActiveMentionQuery } from "@/utils/mention";
import { getAvatarUrl } from "@/utils/file-url";
import { clearDraft, getDraft, setDraft } from "@/features/messages/lib/draft-store";
import type { DirectoryUser } from "@/features/users/types/user.types";
import type { ContactMessagePayload, Message } from "@/features/messages/types/message.types";

interface MessageInputProps {
  conversationId: string;
  onSend: (content: string, fileIds?: string[], type?: "STICKER" | "CONTACT") => Promise<void> | void;
  onTyping: () => void;
  onStopTyping: () => void;
  attachmentsState: ReturnType<typeof useMessageAttachments>;
  /** Mensaje al que se está respondiendo — el envío en sí lo resuelve el
   * `onSend` del padre (ver ConversationView.tsx), este componente solo
   * muestra la cita y permite cancelarla. */
  replyTo: Message | null;
  onCancelReply: () => void;
  currentUserId: string;
  mentionCandidates?: MentionCandidate[];
  onShareContact?: (user: DirectoryUser) => void;
}

interface AttachmentOption {
  label: string;
  accept?: string;
  icon: TablerIcon;
  isContact?: boolean;
}

/** `accept: undefined` para "Documento" — a propósito, sin filtro (el
 * backend ya no tiene allowlist de MIME para adjuntos, ver backend/API.md
 * sección 9). Las imágenes/videos que elijas acá igual pasan por la misma
 * compresión que "Foto" — la diferencia entre opciones es solo qué filtro
 * usa el picker nativo, no el manejo posterior. */
const ATTACHMENT_OPTIONS: AttachmentOption[] = [
  { label: "Foto", accept: "image/*", icon: IconPhoto },
  { label: "Video", accept: "video/*", icon: IconVideo },
  { label: "Audio", accept: "audio/*", icon: IconHeadphones },
  { label: "Documento", icon: IconFileText },
  { label: "Contacto", icon: IconUser, isContact: true },
];

// Tope de altura para que el textarea crezca con mensajes largos sin comerse
// el resto del chat — debe coincidir con `max-h-32` en su className, ya que
// el cálculo de `scrollHeight` de acá abajo no lee ese valor del CSS.
const TEXTAREA_MAX_HEIGHT_PX = 128;

export function MessageInput({
  conversationId,
  onSend,
  onTyping,
  onStopTyping,
  attachmentsState,
  replyTo,
  onCancelReply,
  currentUserId,
  mentionCandidates,
  onShareContact,
}: MessageInputProps) {
  const [value, setValue] = useState(() => getDraft(currentUserId, conversationId));
  const [cursorPosition, setCursorPosition] = useState(0);

  useEffect(() => {
    const loadedDraft = getDraft(currentUserId, conversationId);
    setValue(loadedDraft);
    setCursorPosition(loadedDraft.length);
  }, [conversationId, currentUserId]);

  function updateValueAndDraft(nextValue: string) {
    setValue(nextValue);
    setDraft(currentUserId, conversationId, nextValue);
  }

  const [mentionQuery, setMentionQuery] = useState<ActiveMentionQuery | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [isShareContactOpen, setIsShareContactOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [reactionsPickerOpen, setReactionsPickerOpen] = useState(false);
  const [importingGif, setImportingGif] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [sendingVoiceNote, setSendingVoiceNote] = useState(false);
  const [voiceNoteError, setVoiceNoteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const reactionsPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { session } = useAuth();
  const publicSettings = usePublicSettings();
  const recorder = useVoiceRecorder();

  const filteredMentionCandidates = useMemo(() => {
    if (!mentionQuery || !mentionCandidates) return [];
    const q = mentionQuery.query.toLowerCase();
    return mentionCandidates
      .filter((candidate) => candidate.id !== currentUserId)
      .filter((candidate) => {
        if (!q) return true;
        const nameMatch = candidate.name.toLowerCase().includes(q);
        const usernameMatch = candidate.username ? candidate.username.toLowerCase().includes(q) : false;
        return nameMatch || usernameMatch;
      });
  }, [mentionQuery, mentionCandidates, currentUserId]);

  function handleSelectMention(candidate: MentionCandidate) {
    if (!mentionQuery) return;
    const textarea = textareaRef.current;
    const handle = candidate.username || candidate.name.replace(/\s+/g, "_");
    const mentionText = `@${handle} `;

    const beforeMention = value.slice(0, mentionQuery.startIndex);
    const afterMention = value.slice(cursorPosition);
    const nextValue = `${beforeMention}${mentionText}${afterMention}`;
    updateValueAndDraft(nextValue);
    setMentionQuery(null);
    setMentionSelectedIndex(0);

    const nextCursor = beforeMention.length + mentionText.length;
    setCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  function handleShareContact(user: DirectoryUser) {
    if (onShareContact) {
      onShareContact(user);
    } else {
      const contactPayload: ContactMessagePayload = {
        id: user.id,
        name: user.name,
        username: user.username ?? null,
        email: user.email,
        avatarUrl: getAvatarUrl(user),
      };
      void onSend(JSON.stringify(contactPayload), undefined, "CONTACT");
    }
    setIsShareContactOpen(false);
  }

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    const cursorPos = event.target.selectionStart ?? nextValue.length;
    updateValueAndDraft(nextValue);
    setCursorPosition(cursorPos);
    const hasCandidates = Boolean(mentionCandidates && mentionCandidates.length > 0);
    const nextQuery = hasCandidates ? getActiveMentionQuery(nextValue, cursorPos) : null;
    setMentionQuery(nextQuery);
    setMentionSelectedIndex(0);
    onTyping();
  }

  function handleTextareaCursorUpdate(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    const cursorPos = target.selectionStart ?? target.value.length;
    setCursorPosition(cursorPos);
    const hasCandidates = Boolean(mentionCandidates && mentionCandidates.length > 0);
    const nextQuery = hasCandidates ? getActiveMentionQuery(target.value, cursorPos) : null;
    setMentionQuery(nextQuery);
  }
  const {
    attachments,
    addFiles,
    pauseAttachment,
    resumeAttachment,
    retryAttachment,
    removeAttachment,
    removeSentAttachments,
    reset: resetAttachments,
    isUploading,
    fileIds,
    validationErrors,
    dismissValidationError,
    resumableSession,
    resumableMismatchError,
    resumeSessionWithFile,
    discardResumableSession,
  } = attachmentsState;
  const currentValidationError = validationErrors[0];

  // Auto-focus solo en desktop (breakpoint `lg`, ver app/(chat)/layout.tsx):
  // ahí no hay teclado virtual, así que arrancar escribiendo de una es más
  // cómodo. En mobile, auto-focus dispara el teclado apenas se abre el chat
  // — ni WhatsApp ni Telegram lo hacen — así que ahí el foco (y el teclado)
  // solo debe aparecer cuando el usuario toca el campo explícitamente.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      textareaRef.current?.focus();
    }
  }, [conversationId]);

  // Elegir "Responder" en un mensaje lleva el foco al campo de una — igual
  // que WhatsApp/Telegram, para poder escribir la respuesta sin un click de más.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Autogrow: por default un <textarea rows={1}> no crece con el contenido —
  // un mensaje de varias líneas queda "escondido" scrolleando dentro de una
  // caja de una sola línea. Recalculamos la altura en cada cambio de texto:
  // "auto" primero para que scrollHeight refleje el contenido actual (si no,
  // solo puede crecer y nunca se achica al borrar texto), después el mínimo
  // entre eso y el tope — pasado el tope, el textarea scrollea internamente.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!reactionsPickerOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (reactionsPickerRef.current && !reactionsPickerRef.current.contains(event.target as Node)) {
        setReactionsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [reactionsPickerOpen]);

  // §8.3: canSend deja de mirar isUploading global.
  // Permite enviar texto mientras los adjuntos suben, o enviar cuando al menos un adjunto está listo.
  const canSend = (Boolean(value.trim()) || fileIds.length > 0) && !sending;

  async function submit() {
    if (!canSend) return;
    const content = value.trim();
    const readyFileIds = [...fileIds];
    setSending(true);
    setValue("");
    clearDraft(currentUserId, conversationId);
    setMentionQuery(null);
    setCursorPosition(0);
    onStopTyping();
    try {
      await onSend(content, readyFileIds.length > 0 ? readyFileIds : undefined);
      if (readyFileIds.length > 0) {
        removeSentAttachments(readyFileIds);
      } else if (attachments.length === 0) {
        resetAttachments();
      }
    } catch (err) {
      updateValueAndDraft(content);
      throw err;
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery && filteredMentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentionCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const candidate = filteredMentionCandidates[mentionSelectedIndex];
        if (candidate) {
          handleSelectMention(candidate);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = extractFilesFromClipboard(event.clipboardData);
    if (files.length > 0) {
      // Si se pegan archivos desde el portapapeles (capturas, imágenes, PDFs, audios, documentos, etc.),
      // prevenimos la acción por defecto del textarea y los adjuntamos automáticamente.
      event.preventDefault();
      event.stopPropagation();
      addFiles(files);
    }
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      addFiles(event.target.files);
    }
    // Permite volver a elegir el mismo archivo si lo sacaste antes de enviar.
    event.target.value = "";
  }

  // Un solo <input type="file"> reutilizado por las 4 opciones — el `accept`
  // se muta a mano en el DOM (no vía prop/estado) porque el picker nativo lee
  // el atributo en el momento de `.click()`, y una actualización de estado
  // de React no se aplicaría al DOM a tiempo dentro del mismo handler.
  function openPicker(accept?: string) {
    const input = fileInputRef.current;
    if (input) {
      if (accept) input.setAttribute("accept", accept);
      else input.removeAttribute("accept");
    }
    setAttachMenuOpen(false);
    input?.click();
  }

  // Inserta en la posición del cursor (no solo al final) y se lo devuelve al
  // usuario ahí mismo, para poder seguir escribiendo o encadenar más emojis
  // sin tener que volver a clickear el textarea — igual que WhatsApp/Telegram.
  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + emoji + value.slice(end);
    updateValueAndDraft(nextValue);
    onTyping();

    const cursor = start + emoji.length;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  }

  async function handleStartRecording() {
    setVoiceNoteError(null);
    await recorder.start();
  }

  async function handleSendRecording() {
    const file = await recorder.stop();
    if (!file || !session) return;
    setSendingVoiceNote(true);
    setVoiceNoteError(null);
    try {
      const uploaded = await uploadFile(session.token, file, conversationId);
      await onSend("", [uploaded.id]);
    } catch (error) {
      setVoiceNoteError(error instanceof Error ? error.message : "No se pudo enviar la nota de voz.");
    } finally {
      setSendingVoiceNote(false);
    }
  }

  // Mismo patrón que handleSendRecording: se importa (descarga+guarda en el
  // backend) primero, y solo después se manda como mensaje — no hay "chip" de
  // adjunto pendiente en el composer, se manda al toque de elegirlo.
  async function handleSelectGif(kind: GiphyMediaKind, giphyId: string, originalUrl: string) {
    if (!session) return;
    setImportingGif(true);
    setGifError(null);
    try {
      const uploaded = await importGiphyAsset(session.token, kind, giphyId, originalUrl);
      setReactionsPickerOpen(false);
      await onSend("", [uploaded.id], kind === "stickers" ? "STICKER" : undefined);
    } catch (error) {
      setGifError(error instanceof Error ? error.message : "No se pudo enviar.");
    } finally {
      setImportingGif(false);
    }
  }

  async function handleSelectStoredSticker(fileId: string) {
    setReactionsPickerOpen(false);
    await onSend("", [fileId], "STICKER");
  }

  // Igual que WhatsApp/Telegram: el botón de enviar se vuelve micrófono
  // cuando no hay nada más que mandar — apenas escribís algo o adjuntás un
  // archivo, vuelve a ser el botón de enviar.
  const showMicButton = !value.trim() && attachments.length === 0;

  return (
    <div className="min-w-0 border-t border-black/5 dark:border-white/10">
      {replyTo && (
        <div className="pt-2.5 pl-3 pr-5">
          <QuotedMessagePreview
            variant="composer"
            senderName={replyTo.senderId === currentUserId ? "Vos" : replyTo.sender.name}
            preview={buildMessagePreview(replyTo)}
            isDeleted={false}
            onCancel={onCancelReply}
          />
        </div>
      )}
      {resumableSession && attachments.length === 0 && (
        <ResumableUploadBanner
          session={resumableSession}
          onSelectFile={resumeSessionWithFile}
          onDiscard={discardResumableSession}
          mismatchError={resumableMismatchError}
        />
      )}
      {attachments.length > 0 && (
        <div className="flex min-w-0 gap-2 overflow-x-auto pl-3 pr-5 pt-2.5">
          {attachments.map((attachment) => (
            <AttachmentPreviewChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
              onPause={
                attachment.uploader ? () => pauseAttachment(attachment.localId) : undefined
              }
              onResume={
                attachment.uploader ? () => resumeAttachment(attachment.localId) : undefined
              }
              onRetry={() => retryAttachment(attachment.localId)}
            />
          ))}
        </div>
      )}
      {(voiceNoteError || recorder.status === "error") && (
        <p className="px-4 pt-2 text-xs text-red-500">
          {voiceNoteError ?? "No se pudo acceder al micrófono."}
        </p>
      )}
      {gifError && <p className="px-4 pt-2 text-xs text-red-500">{gifError}</p>}
      {recorder.status === "recording" ? (
        <div className="flex items-center gap-3 pl-3 pr-5 py-2.5">
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Cancelar grabación"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <IconTrash size={20} stroke={1.75} />
          </button>
          <div className="flex flex-1 items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="tabular-nums">{formatDuration(recorder.elapsedMs)}</span>
            <span className="text-neutral-400 dark:text-neutral-500">Grabando nota de voz...</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSendRecording()}
            disabled={sendingVoiceNote}
            aria-label="Enviar nota de voz"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
          >
            {sendingVoiceNote ? <IconLoader2 className="animate-spin" size={18} /> : <IconCheck size={20} />}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-end gap-2 pl-3 pr-5 py-2.5">
          <input ref={fileInputRef} type="file" multiple onChange={handleFilesSelected} className="hidden" />
          <div className="relative flex min-w-0 flex-1 items-end gap-0.5 rounded-2xl border border-black/10 bg-white py-1 pl-1 pr-1.5 focus-within:border-brand-blue dark:border-white/10 dark:bg-white/5">
            {filteredMentionCandidates.length > 0 && mentionQuery && (
              <MentionAutocompleteList
                candidates={filteredMentionCandidates}
                selectedIndex={mentionSelectedIndex}
                onSelect={handleSelectMention}
              />
            )}
            <div className="relative shrink-0" ref={attachMenuRef}>
              {attachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
                  {ATTACHMENT_OPTIONS.map(({ label, accept, icon: OptionIcon, isContact }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (isContact) {
                          setAttachMenuOpen(false);
                          setIsShareContactOpen(true);
                        } else {
                          openPicker(accept);
                        }
                      }}
                      className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
                    >
                      <OptionIcon size={18} stroke={1.75} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setReactionsPickerOpen(false);
                  setAttachMenuOpen((prev) => !prev);
                }}
                aria-label="Adjuntar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <IconPaperclip size={20} stroke={1.75} />
              </button>
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={handleTextChange}
              onClick={handleTextareaCursorUpdate}
              onKeyUp={handleTextareaCursorUpdate}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={attachments.length > 0 ? "Agregá un mensaje (opcional)" : "Escribí un mensaje"}
              className="max-h-32 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1.5 text-sm text-brand-ink outline-none dark:text-white"
            />
            {session && (
              <div className="relative shrink-0" ref={reactionsPickerRef}>
                {reactionsPickerOpen && (
                  <div className="absolute bottom-full right-0 mb-2">
                    <EmojiGifStickerPicker
                      token={session.token}
                      userId={currentUserId}
                      showGifsAndStickers={Boolean(publicSettings?.allowStickersAndGifs)}
                      busy={importingGif}
                      onSelectEmoji={insertEmoji}
                      onSelectGifSticker={handleSelectGif}
                      onSelectStoredSticker={handleSelectStoredSticker}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setReactionsPickerOpen((prev) => !prev);
                  }}
                  disabled={importingGif}
                  aria-label="Emojis, GIFs y stickers"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {importingGif ? (
                    <IconLoader2 size={20} stroke={1.75} className="animate-spin" />
                  ) : (
                    <IconMoodPlus size={20} stroke={1.75} />
                  )}
                </button>
              </div>
            )}
          </div>
          {showMicButton ? (
            <button
              type="button"
              onClick={() => void handleStartRecording()}
              aria-label="Grabar nota de voz"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity"
            >
              <IconMicrophone size={18} stroke={1.75} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Enviar mensaje"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
            >
              <IconSend2 size={18} stroke={1.75} />
            </button>
          )}
        </form>
      )}

      {currentValidationError && (
        <AttachmentErrorModal
          fileName={currentValidationError.fileName}
          reason={currentValidationError.reason}
          maxUploadSizeMb={publicSettings?.maxUploadSizeMb}
          onAccept={() => dismissValidationError(currentValidationError.id)}
        />
      )}

      {isShareContactOpen && (
        <ShareContactModal
          onClose={() => setIsShareContactOpen(false)}
          onSelectContact={handleShareContact}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
