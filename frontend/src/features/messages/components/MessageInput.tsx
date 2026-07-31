"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  IconFileText,
  IconHeadphones,
  IconPaperclip,
  IconPhoto,
  IconSend2,
  IconVideo,
  type TablerIcon,
} from "@tabler/icons-react";
import { AttachmentPreviewChip } from "@/features/messages/components/AttachmentPreviewChip";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";

interface MessageInputProps {
  conversationId: string;
  onSend: (content: string, fileIds?: string[]) => Promise<void> | void;
  onTyping: () => void;
  onStopTyping: () => void;
  attachmentsState: ReturnType<typeof useMessageAttachments>;
}

/** `accept: undefined` para "Documento" — a propósito, sin filtro (el
 * backend ya no tiene allowlist de MIME para adjuntos, ver backend/API.md
 * sección 9). Las imágenes/videos que elijas acá igual pasan por la misma
 * compresión que "Foto" — la diferencia entre opciones es solo qué filtro
 * usa el picker nativo, no el manejo posterior. */
const ATTACHMENT_OPTIONS: { label: string; accept?: string; icon: TablerIcon }[] = [
  { label: "Foto", accept: "image/*", icon: IconPhoto },
  { label: "Video", accept: "video/*", icon: IconVideo },
  { label: "Audio", accept: "audio/*", icon: IconHeadphones },
  { label: "Documento", icon: IconFileText },
];

export function MessageInput({
  conversationId,
  onSend,
  onTyping,
  onStopTyping,
  attachmentsState,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { attachments, addFiles, removeAttachment, reset: resetAttachments, isUploading, fileIds } =
    attachmentsState;

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

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

  const canSend = (Boolean(value.trim()) || fileIds.length > 0) && !sending && !isUploading;

  async function submit() {
    if (!canSend) return;
    const content = value.trim();
    setSending(true);
    setValue("");
    onStopTyping();
    try {
      await onSend(content, fileIds.length > 0 ? fileIds : undefined);
      resetAttachments();
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
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

  return (
    <div className="border-t border-black/5 dark:border-white/10">
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pl-3 pr-5 pt-2.5">
          {attachments.map((attachment) => (
            <AttachmentPreviewChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 pl-3 pr-5 py-2.5">
        <input ref={fileInputRef} type="file" multiple onChange={handleFilesSelected} className="hidden" />
        <div className="relative" ref={attachMenuRef}>
          {attachMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 flex flex-col overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
              {ATTACHMENT_OPTIONS.map(({ label, accept, icon: OptionIcon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => openPicker(accept)}
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
            onClick={() => setAttachMenuOpen((prev) => !prev)}
            aria-label="Adjuntar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconPaperclip size={20} stroke={1.75} />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={attachments.length > 0 ? "Agregá un mensaje (opcional)" : "Escribí un mensaje"}
          className="max-h-32 flex-1 min-w-0 resize-none rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm text-brand-ink outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar mensaje"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
        >
          <IconSend2 size={18} stroke={1.75} />
        </button>
      </form>
    </div>
  );
}
