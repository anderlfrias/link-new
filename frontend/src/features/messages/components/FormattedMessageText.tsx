"use client";

import { useMemo } from "react";
import { tokenizeMessageContent } from "@/utils/linkify";

interface FormattedMessageTextProps {
  content: string;
  isOwn?: boolean;
  searchQuery?: string;
}

function renderWithHighlight(text: string, query: string | undefined, keyPrefix: string | number) {
  const trimmed = query?.trim();
  if (!trimmed) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  if (parts.length <= 1) return text;

  return parts.map((part, i) => {
    if (part.toLowerCase() === trimmed.toLowerCase()) {
      return (
        <mark
          key={`${keyPrefix}-${i}`}
          className="rounded-sm bg-yellow-300/90 px-0.5 font-medium text-neutral-900 shadow-sm dark:bg-yellow-400/90 dark:text-neutral-900"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

/**
 * Renderiza el texto de un mensaje transformando automáticamente URLs en enlaces navegables,
 * correos electrónicos en enlaces 'mailto:' y números telefónicos en enlaces 'tel:'.
 */
export function FormattedMessageText({ content, isOwn = false, searchQuery }: FormattedMessageTextProps) {
  const tokens = useMemo(() => tokenizeMessageContent(content), [content]);

  const linkClasses = isOwn
    ? "text-white font-medium underline underline-offset-2 decoration-white/60 hover:decoration-white hover:text-white transition-colors break-all"
    : "text-brand-blue dark:text-brand-blue-light font-medium underline underline-offset-2 decoration-brand-blue/40 hover:decoration-brand-blue transition-colors break-all";

  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === "text") {
          return renderWithHighlight(token.value, searchQuery, index);
        }

        if (token.type === "url") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Abrir enlace: ${token.href}`}
              onClick={(event) => event.stopPropagation()}
              className={linkClasses}
            >
              {token.value}
            </a>
          );
        }

        if (token.type === "email") {
          return (
            <a
              key={index}
              href={token.href}
              title={`Enviar correo a: ${token.value}`}
              onClick={(event) => event.stopPropagation()}
              className={linkClasses}
            >
              {token.value}
            </a>
          );
        }

        if (token.type === "phone") {
          return (
            <a
              key={index}
              href={token.href}
              title={`Llamar a: ${token.value}`}
              onClick={(event) => event.stopPropagation()}
              className={linkClasses}
            >
              {token.value}
            </a>
          );
        }

        return token.value;
      })}
    </>
  );
}
