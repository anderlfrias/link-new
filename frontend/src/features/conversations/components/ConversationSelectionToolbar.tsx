"use client";

import {
  IconChecklist,
  IconDoorExit,
  IconLoader2,
  IconMailOpened,
  IconPin,
  IconPinnedOff,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "@/i18n";

interface ConversationSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onClose: () => void;
  canMarkAsRead?: boolean;
  onMarkAsRead: () => void;
  canPin?: boolean;
  isAllPinned?: boolean;
  onTogglePin: () => void;
  canFavorite?: boolean;
  isAllFavorite?: boolean;
  onToggleFavorite: () => void;
  hasGroupsSelected?: boolean;
  onLeaveGroups: () => void;
  canDelete?: boolean;
  onDelete: () => void;
  pending?: boolean;
}

export function ConversationSelectionToolbar({
  selectedCount,
  totalCount,
  allSelected,
  onToggleSelectAll,
  onClose,
  canMarkAsRead = false,
  onMarkAsRead,
  canPin = true,
  isAllPinned = false,
  onTogglePin,
  canFavorite = true,
  isAllFavorite = false,
  onToggleFavorite,
  hasGroupsSelected = false,
  onLeaveGroups,
  canDelete = true,
  onDelete,
  pending = false,
}: ConversationSelectionToolbarProps) {
  const { t } = useTranslation();
  const countLabel =
    selectedCount === 1
      ? t("chatList.selectedSingle")
      : t("chatList.selectedCount", { count: selectedCount });

  return (
    <div
      role="toolbar"
      aria-label="Acciones de conversaciones seleccionadas"
      className="flex h-14 w-full items-center justify-between border-b border-black/5 bg-white/95 px-3 py-2 backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/95 transition-all duration-200"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label={t("chatList.closeSelection")}
          title={t("chatList.closeSelectionShortcut")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.8} />
        </button>
        <span className="truncate font-semibold text-brand-ink dark:text-white text-sm sm:text-base">
          {countLabel}
        </span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        {/* Seleccionar todo / Deseleccionar todo */}
        <button
          type="button"
          onClick={onToggleSelectAll}
          disabled={totalCount === 0 || pending}
          aria-label={allSelected ? t("chatList.deselectAll") : t("chatList.selectAll")}
          title={allSelected ? t("chatList.deselectAll") : t("chatList.selectAll")}
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-brand-blue-light"
        >
          <IconChecklist size={19} stroke={1.8} />
        </button>

        {/* Marcar como leído */}
        {canMarkAsRead && (
          <button
            type="button"
            onClick={onMarkAsRead}
            disabled={selectedCount === 0 || pending}
            aria-label={t("chatList.markAsRead")}
            title={t("chatList.markAsRead")}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-brand-blue-light"
          >
            <IconMailOpened size={19} stroke={1.8} />
          </button>
        )}

        {/* Fijar / Desfijar */}
        {canPin && (
          <button
            type="button"
            onClick={onTogglePin}
            disabled={selectedCount === 0 || pending}
            aria-label={isAllPinned ? t("chatList.unpinSelected") : t("chatList.pinSelected")}
            title={isAllPinned ? t("chatList.unpinSelected") : t("chatList.pinSelected")}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-brand-blue-light"
          >
            {isAllPinned ? <IconPinnedOff size={19} stroke={1.8} /> : <IconPin size={19} stroke={1.8} />}
          </button>
        )}

        {/* Favorito */}
        {canFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={selectedCount === 0 || pending}
            aria-label={isAllFavorite ? t("chatList.unfavoriteSelected") : t("chatList.favoriteSelected")}
            title={isAllFavorite ? t("chatList.unfavoriteSelected") : t("chatList.favoriteSelected")}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-amber-400"
          >
            {isAllFavorite ? (
              <IconStarFilled size={19} className="text-amber-500 dark:text-amber-400" />
            ) : (
              <IconStar size={19} stroke={1.8} />
            )}
          </button>
        )}

        {/* Salir de grupos */}
        {hasGroupsSelected && (
          <button
            type="button"
            onClick={onLeaveGroups}
            disabled={selectedCount === 0 || pending}
            aria-label={t("chatList.leaveSelectedGroups")}
            title={t("chatList.leaveSelectedGroups")}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-red-500/15 dark:hover:text-red-400"
          >
            <IconDoorExit size={19} stroke={1.8} />
          </button>
        )}

        {/* Eliminar chats */}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={selectedCount === 0 || pending}
            aria-label={t("chatList.deleteSelectedChats")}
            title={t("chatList.deleteSelectedChats")}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-red-500/15 dark:hover:text-red-400"
          >
            {pending ? <IconLoader2 size={19} className="animate-spin" /> : <IconTrash size={19} stroke={1.8} />}
          </button>
        )}
      </div>
    </div>
  );
}
