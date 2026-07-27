"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useRef, useState } from "react";
import { IconPaperclip, IconSend2 } from "@tabler/icons-react";
import { AttachmentPreviewChip } from "@/features/messages/components/AttachmentPreviewChip";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { ATTACHMENT_ACCEPT } from "@/constants/allowed-file-types";

interface MessageInputProps {
  conversationId: string;
  onSend: (content: string, fileIds?: string[]) => Promise<void> | void;
  onTyping: () => void;
  onStopTyping: () => void;
}

export function MessageInput({ conversationId, onSend, onTyping, onStopTyping }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { attachments, addFiles, removeAttachment, reset: resetAttachments, isUploading, fileIds } =
    useMessageAttachments(conversationId);

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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          onChange={handleFilesSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Adjuntar archivo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconPaperclip size={20} stroke={1.75} />
        </button>
        <textarea
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
