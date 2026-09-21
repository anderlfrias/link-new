"use client";

import { useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconLoader2,
  IconMessageDots,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useStartConversation } from "@/features/conversations/hooks/use-start-conversation";
import { copyTextToClipboard } from "@/utils/clipboard";
import { cn } from "@/utils/cn";
import type { ContactMessagePayload } from "@/features/messages/types/message.types";

export interface ContactMessageCardProps {
  rawContent: string;
  isOwn: boolean;
  currentUserId?: string;
  footer?: React.ReactNode;
}

export function ContactMessageCard({
  rawContent,
  isOwn,
  currentUserId,
  footer,
}: ContactMessageCardProps) {
  const [copied, setCopied] = useState(false);
  const { startWithUser, pending } = useStartConversation();

  let contact: ContactMessagePayload | null = null;
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === "object" && typeof parsed.name === "string") {
      contact = parsed as ContactMessagePayload;
    }
  } catch {
    contact = null;
  }

  if (!contact) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-semibold">👤 Contacto</p>
        <p className="text-xs opacity-80 break-all">{rawContent}</p>
        {footer && <div className="flex justify-end mt-1">{footer}</div>}
      </div>
    );
  }

  const isSelfContact = Boolean(currentUserId && contact.id === currentUserId);

  async function handleStartChat() {
    if (!contact) return;
    await startWithUser(contact.id);
  }

  async function handleCopyEmail() {
    if (!contact?.email) return;
    const ok = await copyTextToClipboard(contact.email);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 py-0.5" data-testid="contact-message-card">
      {/* Información principal del contacto (Avatar, Nombre, Handle, Email) */}
      <div className="flex items-center gap-3">
        <Avatar
          name={contact.name}
          imageUrl={contact.avatarUrl ?? undefined}
          size="lg"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate font-semibold text-sm leading-snug",
                isOwn ? "text-white" : "text-neutral-900 dark:text-neutral-100",
              )}
              title={contact.name}
            >
              {contact.name}
            </span>
            {isSelfContact && (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  isOwn
                    ? "bg-white/20 text-white"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
                )}
              >
                Vos
              </span>
            )}
          </div>
          {contact.username && (
            <span
              className={cn(
                "truncate text-xs",
                isOwn ? "text-white/80" : "text-neutral-500 dark:text-neutral-400",
              )}
            >
              @{contact.username}
            </span>
          )}
          <span
            className={cn(
              "truncate text-xs",
              isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
            )}
            title={contact.email}
          >
            {contact.email}
          </span>
        </div>
      </div>

      {/* Divisor */}
      <div
        className={cn(
          "h-px w-full",
          isOwn ? "bg-white/20" : "bg-black/10 dark:bg-white/10",
        )}
      />

      {/* Botones de acción y pie de fecha/estado */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => void handleStartChat()}
            disabled={pending}
            aria-label="Enviar mensaje a este contacto"
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors select-none",
              isOwn
                ? "bg-white/15 text-white hover:bg-white/25 active:bg-white/30 disabled:opacity-50"
                : "bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 active:bg-brand-blue/20 dark:bg-brand-blue/20 dark:text-brand-blue-light dark:hover:bg-brand-blue/30 disabled:opacity-50",
            )}
          >
            {pending ? (
              <IconLoader2 size={15} className="animate-spin" />
            ) : (
              <IconMessageDots size={15} stroke={2} />
            )}
            <span>Enviar mensaje</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyEmail()}
            aria-label={copied ? "Correo copiado" : "Copiar correo del contacto"}
            title="Copiar correo"
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors select-none",
              isOwn
                ? "bg-white/10 text-white/90 hover:bg-white/20 active:bg-white/25"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600",
            )}
          >
            {copied ? (
              <>
                <IconCheck size={14} stroke={2.5} className="text-emerald-400" />
                <span className="text-[11px] text-emerald-400">Copiado</span>
              </>
            ) : (
              <>
                <IconCopy size={14} stroke={2} />
                <span className="hidden sm:inline text-[11px]">Copiar</span>
              </>
            )}
          </button>
        </div>

        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
