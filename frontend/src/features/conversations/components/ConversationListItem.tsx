"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBookmark, IconCheck, IconChevronDown, IconPin } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { UnreadBadge } from "@/components/ui/Badge";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { ConversationOptionsMenu } from "@/features/conversations/components/ConversationOptionsMenu";
import { useLongPress } from "@/features/conversations/hooks/use-long-press";
import { useDraft } from "@/features/messages/hooks/use-draft";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { MessagePreviewLabel } from "@/features/conversations/components/MessagePreviewLabel";
import {
  getConversationAvatarUrl,
  getConversationDisplayName,
  getConversationPreviewParts,
  getLastMessagePreviewText,
} from "@/utils/conversation-display";
import { formatConversationTimestamp } from "@/utils/format-date";
import { cn } from "@/utils/cn";
import { useTranslation } from "@/i18n";
import type { ConversationListItem as ConversationListItemType } from "@/features/conversations/types/conversation.types";

interface ConversationListItemProps {
  conversation: ConversationListItemType;
  currentUserId: string;
  pending: boolean;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onTogglePin: (conversationId: string, next: boolean) => void;
  onToggleFavorite: (conversationId: string, next: boolean) => void;
  onRequestDeleteChat: (conversationId: string) => void;
  onRequestDeleteGroup: (conversationId: string) => void;
  onRequestLeaveGroup: (conversationId: string) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (conversationId: string) => void;
  onEnterSelectionMode?: (conversationId: string) => void;
}

export function ConversationListItem({
  conversation,
  currentUserId,
  pending,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onTogglePin,
  onToggleFavorite,
  onRequestDeleteChat,
  onRequestDeleteGroup,
  onRequestLeaveGroup,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onEnterSelectionMode,
}: ConversationListItemProps) {
  const { t, locale } = useTranslation();
  const publicSettings = usePublicSettings();
  const isGroup = conversation.type === "GROUP";
  // El backend es la autoridad real (`whoCanDeleteGroup` incluido) — acá solo
  // se gatea por el interruptor público, para no pagar un fetch de settings
  // de grupo por cada fila de la lista. Un 403 se muestra como error en el
  // modal de confirmación.
  const canDeleteChat = !isGroup && Boolean(publicSettings?.allowConversationDelete);
  const canDeleteGroup = isGroup && Boolean(publicSettings?.allowGroupDelete);
  const pathname = usePathname();
  const isActive = pathname === `/conversations/${conversation.id}`;
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
  const previewParts = getConversationPreviewParts(conversation, currentUserId);
  const draft = useDraft(conversation.id, currentUserId);

  // En desktop el disparador es la flecha (hover); en mobile, mantener
  // presionado — el long-press vive en el wrapper porque el toque puede
  // empezar dentro del <Link> (los eventos de touch burbujean igual).
  const longPress = useLongPress(onOpenMenu);

  return (
    <div className="group relative">
      <div {...longPress}>
        <Link
          href={`/conversations/${conversation.id}`}
          onClick={(event) => {
            if (isSelectionMode) {
              event.preventDefault();
              onToggleSelect?.(conversation.id);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenMenu();
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/3 dark:hover:bg-white/5",
            isActive && !isSelectionMode && "bg-black/4 dark:bg-white/10",
            isSelectionMode && "cursor-pointer select-none",
            isSelected && "bg-brand-blue/10 dark:bg-brand-blue/20 hover:bg-brand-blue/15 dark:hover:bg-brand-blue/25",
          )}
        >
          {isSelectionMode && (
            <div
              role="checkbox"
              aria-checked={isSelected}
              aria-label={
                isSelected
                  ? t("chatList.deselectAria", { name: displayName })
                  : t("chatList.selectAria", { name: displayName })
              }
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                isSelected
                  ? "border-brand-blue bg-brand-blue text-white"
                  : "border-neutral-300 bg-white/50 dark:border-neutral-600 dark:bg-neutral-800/50",
              )}
            >
              {isSelected && <IconCheck size={13} stroke={3} />}
            </div>
          )}
          <Avatar
            name={displayName}
            imageUrl={avatarUrl}
            icon={conversation.type === "SELF" ? <IconBookmark size={22} stroke={1.75} /> : undefined}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-brand-ink dark:text-white">{displayName}</span>
              <span className="flex shrink-0 items-center gap-1">
                {conversation.isPinnedByMe && <IconPin size={12} className="text-neutral-400" />}
                <span className="text-xs text-neutral-400">
                  {conversation.lastMessageAt ? formatConversationTimestamp(conversation.lastMessageAt, locale) : ""}
                </span>
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                {draft ? (
                  <>
                    <span className="font-medium text-rose-500 dark:text-rose-400">{t("chatList.draftPrefix")}</span>
                    <span className="text-neutral-700 dark:text-neutral-300">{draft}</span>
                  </>
                ) : (
                  <MessagePreviewLabel
                    senderPrefix={previewParts.senderPrefix}
                    preview={previewParts.preview}
                  />
                )}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {!draft && conversation.lastMessageSenderId === currentUserId && (
                  <MessageStatusTicks status={conversation.lastMessageStatus} />
                )}
                <UnreadBadge count={conversation.unreadCount} />
                {/* Flecha "▾" — solo visible si no estamos en modo selección */}
                {!isSelectionMode && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (menuOpen) onCloseMenu();
                      else onOpenMenu();
                    }}
                    disabled={pending}
                    aria-label={t("chatList.optionsAria", { name: displayName })}
                    className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-white/10 md:flex"
                  >
                    <IconChevronDown size={14} stroke={2} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </Link>
      </div>

      <ConversationOptionsMenu
        open={menuOpen}
        onClose={onCloseMenu}
        isPinned={conversation.isPinnedByMe}
        isFavorite={conversation.isFavoritedByMe}
        onTogglePin={() => onTogglePin(conversation.id, !conversation.isPinnedByMe)}
        onToggleFavorite={() => onToggleFavorite(conversation.id, !conversation.isFavoritedByMe)}
        onSelect={onEnterSelectionMode ? () => onEnterSelectionMode(conversation.id) : undefined}
        onDeleteChat={canDeleteChat ? () => onRequestDeleteChat(conversation.id) : undefined}
        onDeleteGroup={canDeleteGroup ? () => onRequestDeleteGroup(conversation.id) : undefined}
        onLeaveGroup={isGroup ? () => onRequestLeaveGroup(conversation.id) : undefined}
      />
    </div>
  );
}
