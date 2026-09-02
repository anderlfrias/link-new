"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronDown, IconPin } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { UnreadBadge } from "@/components/ui/Badge";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { ConversationOptionsMenu } from "@/features/conversations/components/ConversationOptionsMenu";
import { useLongPress } from "@/features/conversations/hooks/use-long-press";
import { usePublicSettings } from "@/providers/public-settings-provider";
import {
  getConversationAvatarUrl,
  getConversationDisplayName,
  getLastMessagePreviewText,
} from "@/utils/conversation-display";
import { formatConversationTimestamp } from "@/utils/format-date";
import { cn } from "@/utils/cn";
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
}: ConversationListItemProps) {
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
  const secondaryText = getLastMessagePreviewText(conversation, currentUserId);

  // En desktop el disparador es la flecha (hover); en mobile, mantener
  // presionado — el long-press vive en el wrapper porque el toque puede
  // empezar dentro del <Link> (los eventos de touch burbujean igual).
  const longPress = useLongPress(onOpenMenu);

  return (
    <div className="group relative">
      <div {...longPress}>
        <Link
          href={`/conversations/${conversation.id}`}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenMenu();
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/3 dark:hover:bg-white/5",
            isActive && "bg-black/4 dark:bg-white/10",
          )}
        >
          <Avatar name={displayName} imageUrl={avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-brand-ink dark:text-white">{displayName}</span>
              <span className="flex shrink-0 items-center gap-1">
                {conversation.isPinnedByMe && <IconPin size={12} className="text-neutral-400" />}
                <span className="text-xs text-neutral-400">
                  {conversation.lastMessageAt ? formatConversationTimestamp(conversation.lastMessageAt) : ""}
                </span>
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                {secondaryText}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {conversation.lastMessageSenderId === currentUserId && (
                  <MessageStatusTicks status={conversation.lastMessageStatus} />
                )}
                <UnreadBadge count={conversation.unreadCount} />
                {/* Flecha "▾" — mismo lugar que WhatsApp: al lado de los
                    ticks/badge, solo visible en hover (desktop) con
                    transición. En mobile no se renderiza — ahí la
                    interacción es el long-press de arriba. */}
                <button
                  type="button"
                  onClick={(event) => {
                    // Este botón vive adentro del <Link> de la fila para
                    // poder alinearse en flujo normal junto a los ticks/badge
                    // (mismo lugar que WhatsApp) — sin esto, el click
                    // navegaría a la conversación además de abrir el menú.
                    event.preventDefault();
                    event.stopPropagation();
                    if (menuOpen) onCloseMenu();
                    else onOpenMenu();
                  }}
                  disabled={pending}
                  aria-label={`Opciones de ${displayName}`}
                  className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-white/10 md:flex"
                >
                  <IconChevronDown size={14} stroke={2} />
                </button>
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
        onDeleteChat={canDeleteChat ? () => onRequestDeleteChat(conversation.id) : undefined}
        onDeleteGroup={canDeleteGroup ? () => onRequestDeleteGroup(conversation.id) : undefined}
        onLeaveGroup={isGroup ? () => onRequestLeaveGroup(conversation.id) : undefined}
      />
    </div>
  );
}
