"use client";

import { IconArrowForwardUp, IconCopy, IconTrash, IconX } from "@tabler/icons-react";

interface MessageSelectionToolbarProps {
  selectedCount: number;
  canCopy?: boolean;
  canForward?: boolean;
  canDelete?: boolean;
  onClose: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
}

export function MessageSelectionToolbar({
  selectedCount,
  canCopy = true,
  canForward = true,
  canDelete = true,
  onClose,
  onCopy,
  onForward,
  onDelete,
}: MessageSelectionToolbarProps) {
  const countLabel =
    selectedCount === 1 ? "1 seleccionado" : `${selectedCount} seleccionados`;

  return (
    <div
      role="toolbar"
      aria-label="Acciones de mensajes seleccionados"
      className="flex h-14 items-center justify-between border-b border-black/5 bg-white/95 px-3 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/95 transition-all duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar selección"
          title="Cerrar selección (Esc)"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.8} />
        </button>
        <span className="truncate font-semibold text-brand-ink dark:text-white text-base">
          {countLabel}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onCopy}
          disabled={!canCopy || selectedCount === 0}
          aria-label="Copiar mensajes"
          title="Copiar mensajes"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-brand-blue-light"
        >
          <IconCopy size={19} stroke={1.8} />
        </button>

        <button
          type="button"
          onClick={onForward}
          disabled={!canForward || selectedCount === 0}
          aria-label="Reenviar mensajes"
          title="Reenviar mensajes"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-brand-blue-light"
        >
          <IconArrowForwardUp size={19} stroke={1.8} />
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete || selectedCount === 0}
          aria-label="Eliminar mensajes"
          title={
            canDelete
              ? "Eliminar mensajes"
              : "No todos los mensajes seleccionados pueden ser eliminados"
          }
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-red-500/15 dark:hover:text-red-400"
        >
          <IconTrash size={19} stroke={1.8} />
        </button>
      </div>
    </div>
  );
}
