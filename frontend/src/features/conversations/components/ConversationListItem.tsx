"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDotsVertical, IconPin } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { UnreadBadge } from "@/components/ui/Badge";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { ConversationOptionsMenu } from "@/features/conversations/components/ConversationOptionsMenu";
import { useLongPress } from "@/features/conversations/hooks/use-long-press";
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
  onTogglePin: (conversationId: string, next: boolean) => void;
  onToggleFavorite: (conversationId: string, next: boolean) => void;
}

export function ConversationListItem({
  conversation,
  currentUserId,
  pending,
  onTogglePin,
  onToggleFavorite,
}: ConversationListItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/conversations/${conversation.id}`;
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
  const secondaryText = getLastMessagePreviewText(conversation, currentUserId);

  const [menuOpen, setMenuOpen] = useState(false);
  // En desktop el disparador es el botón "⋮" (hover); en mobile, mantener
  // presionado — el long-press vive en el wrapper porque el toque puede
  // empezar dentro del <Link> (los eventos de touch burbujean igual).
  const longPress = useLongPress(() => setMenuOpen(true));

  return (
    <div className="group relative">
      <div {...longPress}>
        <Link
          href={`/conversations/${conversation.id}`}
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
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Botón "⋮" — solo desktop (hover-revealed). En mobile la interacción
          es el long-press de arriba, sin botón visible. */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        disabled={pending}
        aria-label={`Opciones de ${displayName}`}
        className="absolute right-3 top-3 hidden h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-500 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100 disabled:opacity-60 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 md:flex"
      >
        <IconDotsVertical size={16} />
      </button>

      <ConversationOptionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isPinned={conversation.isPinnedByMe}
        isFavorite={conversation.isFavoritedByMe}
        onTogglePin={() => onTogglePin(conversation.id, !conversation.isPinnedByMe)}
        onToggleFavorite={() => onToggleFavorite(conversation.id, !conversation.isFavoritedByMe)}
      />
    </div>
  );
}
