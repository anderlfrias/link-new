"use client";

import { useEffect, useRef } from "react";
import { IconDoorExit, IconPin, IconPinnedOff, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";

interface ConversationOptionsMenuProps {
  open: boolean;
  onClose: () => void;
  isPinned: boolean;
  isFavorite: boolean;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  /** PRIVATE únicamente — "Eliminar chat" (se oculta solo para quien lo borra). Ausente = no
   * mostrar la opción (ej. `allowConversationDelete` en `false`, o es una conversación GROUP). */
  onDeleteChat?: () => void;
  /** GROUP únicamente — "Eliminar grupo" (para todos los integrantes). */
  onDeleteGroup?: () => void;
  /** GROUP únicamente — "Salir del grupo" (auto-remoción). */
  onLeaveGroup?: () => void;
}

/** Mismo patrón que GroupMemberRow.tsx/UserMenu.tsx (panel absoluto +
 * mousedown afuera cierra), pero controlado desde afuera (`open`/`onClose`
 * como props) para que tanto el botón "⋮" (desktop) como el long-press
 * (mobile) lo puedan abrir sobre el mismo componente. */
export function ConversationOptionsMenu({
  open,
  onClose,
  isPinned,
  isFavorite,
  onTogglePin,
  onToggleFavorite,
  onDeleteChat,
  onDeleteGroup,
  onLeaveGroup,
}: ConversationOptionsMenuProps) {
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

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute right-2 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900"
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          onTogglePin();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
      >
        {isPinned ? <IconPinnedOff size={16} stroke={1.75} /> : <IconPin size={16} stroke={1.75} />}
        {isPinned ? "Desfijar" : "Fijar arriba"}
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          onToggleFavorite();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
      >
        {isFavorite ? <IconStarFilled size={16} /> : <IconStar size={16} stroke={1.75} />}
        {isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
      </button>
      {onLeaveGroup && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onLeaveGroup();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <IconDoorExit size={16} stroke={1.75} />
          Salir del grupo
        </button>
      )}
      {(onDeleteChat || onDeleteGroup) && (
        <button
          type="button"
          onClick={() => {
            onClose();
            (onDeleteChat ?? onDeleteGroup)?.();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <IconTrash size={16} stroke={1.75} />
          {onDeleteChat ? "Eliminar chat" : "Eliminar grupo"}
        </button>
      )}
    </div>
  );
}
