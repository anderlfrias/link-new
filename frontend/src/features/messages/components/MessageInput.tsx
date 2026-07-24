"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { IconSend2 } from "@tabler/icons-react";

interface MessageInputProps {
  onSend: (content: string) => Promise<void> | void;
  onTyping: () => void;
  onStopTyping: () => void;
}

export function MessageInput({ onSend, onTyping, onStopTyping }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    setValue("");
    onStopTyping();
    try {
      await onSend(content);
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-black/5 px-3 py-2.5 dark:border-white/10"
    >
      <textarea
        rows={1}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onTyping();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Escribí un mensaje"
        className="max-h-32 flex-1 resize-none rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm text-brand-ink outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/5 dark:text-white"
      />
      <button
        type="submit"
        disabled={!value.trim() || sending}
        aria-label="Enviar mensaje"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
      >
        <IconSend2 size={18} stroke={1.75} />
      </button>
    </form>
  );
}
