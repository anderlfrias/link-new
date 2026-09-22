"use client";

import { IconX } from "@tabler/icons-react";
import { parseMessagePreview } from "@/features/conversations/components/MessagePreviewLabel";
import { cn } from "@/utils/cn";

interface QuotedMessagePreviewProps {
  senderName: string;
  preview: string;
  isDeleted: boolean;
  /** "composer": barra sobre el campo de texto, con botón de cancelar.
   * "bubble": cita dentro de un mensaje ya enviado, clickeable para saltar al original. */
  variant: "composer" | "bubble";
  /** Solo "bubble" — adapta los colores al fondo de la burbuja (azul propio vs. clara ajena). */
  isOwnBubble?: boolean;
  onClick?: () => void;
  onCancel?: () => void;
}

/** Mismo lenguaje visual en el composer (antes de mandar) y dentro de la
 * burbuja ya enviada (WhatsApp/Telegram usan la misma "tarjeta de cita" en
 * los dos lugares) — una sola implementación evita que diverjan con el tiempo. */
export function QuotedMessagePreview({
  senderName,
  preview,
  isDeleted,
  variant,
  isOwnBubble,
  onClick,
  onCancel,
}: QuotedMessagePreviewProps) {
  const parsed = parseMessagePreview(preview);

  const card = (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border-l-[3px] py-1 pl-2 pr-1",
        variant === "composer"
          ? "border-brand-blue bg-black/[0.03] dark:bg-white/5"
          : isOwnBubble
            ? "border-white/60 bg-white/10"
            : "border-brand-teal-dark bg-black/5 dark:border-brand-teal-light dark:bg-white/5",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden py-0.5">
        <span
          className={cn(
            "truncate text-xs font-semibold",
            variant === "composer"
              ? "text-brand-blue dark:text-brand-blue-light"
              : isOwnBubble
                ? "text-white"
                : "text-brand-teal-dark dark:text-brand-teal-light",
          )}
        >
          {senderName}
        </span>
        <span
          className={cn(
            "inline-flex min-w-0 items-center truncate text-xs",
            (isDeleted || parsed.isDeleted) && "italic",
            variant === "composer"
              ? "text-neutral-500 dark:text-neutral-400"
              : isOwnBubble
                ? "text-white/70"
                : "text-neutral-500 dark:text-neutral-400",
          )}
        >
          {parsed.Icon && (
            <parsed.Icon
              size={13}
              stroke={1.75}
              aria-hidden="true"
              className="mr-1 inline-block shrink-0 -mt-0.5"
            />
          )}
          <span className={cn("truncate", (isDeleted || parsed.isDeleted) && "italic")}>
            {parsed.text}
          </span>
        </span>
      </div>
      {variant === "composer" && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar respuesta"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/10 dark:text-neutral-400 dark:hover:bg-white/10"
        >
          <IconX size={16} stroke={1.75} />
        </button>
      )}
    </div>
  );

  if (variant === "bubble") {
    return (
      <button type="button" onClick={onClick} className="mb-1.5 block w-full text-left">
        {card}
      </button>
    );
  }

  return card;
}
