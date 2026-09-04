"use client";

import { useEffect, useRef } from "react";
import { IconArrowForwardUp, IconCornerUpLeft, IconPencil, IconTrash } from "@tabler/icons-react";

interface MessageOptionsMenuProps {
  open: boolean;
  onClose: () => void;
  canReply: boolean;
  canForward: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onForward: () => void;
  onEdit: () => void;
  onDelete: () => void;
  align: "left" | "right";
}

/** Mismo patrón que ConversationOptionsMenu.tsx: panel absoluto + mousedown
 * afuera cierra, controlado desde afuera para que tanto el botón "⋮" (hover,
 * desktop) como el long-press (mobile) lo puedan abrir sobre el mismo bubble.
 * "Responder"/"Reenviar" van primero (mismo orden que WhatsApp/Telegram) —
 * son las únicas acciones disponibles sobre CUALQUIER mensaje, propio o ajeno. */
export function MessageOptionsMenu({
  open,
  onClose,
  canReply,
  canForward,
  canEdit,
  canDelete,
  onReply,
  onForward,
  onEdit,
  onDelete,
  align,
}: MessageOptionsMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open || (!canReply && !canForward && !canEdit && !canDelete)) return null;

  return (
    <div
      ref={containerRef}
      role="menu"
      className={`absolute top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-black/5 bg-white py-1 text-left shadow-lg dark:border-white/10 dark:bg-neutral-900 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {canReply && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onReply();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconCornerUpLeft size={16} stroke={1.75} />
          Responder
        </button>
      )}
      {canForward && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onForward();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconArrowForwardUp size={16} stroke={1.75} />
          Reenviar
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onEdit();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconPencil size={16} stroke={1.75} />
          Editar
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onDelete();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <IconTrash size={16} stroke={1.75} />
          Eliminar para todos
        </button>
      )}
    </div>
  );
}
