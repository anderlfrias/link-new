"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { UnreadBadge } from "@/components/ui/Badge";
import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { getConversationDisplayName, getLastMessagePreviewText } from "@/utils/conversation-display";
import { formatConversationTimestamp } from "@/utils/format-date";
import { cn } from "@/utils/cn";
import type { ConversationListItem as ConversationListItemType } from "@/features/conversations/types/conversation.types";

interface ConversationListItemProps {
  conversation: ConversationListItemType;
  currentUserId: string;
}

export function ConversationListItem({ conversation, currentUserId }: ConversationListItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/conversations/${conversation.id}`;
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const secondaryText = getLastMessagePreviewText(conversation, currentUserId);

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/3 dark:hover:bg-white/5",
        isActive && "bg-black/4 dark:bg-white/10",
      )}
    >
      <Avatar name={displayName} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-brand-ink dark:text-white">{displayName}</span>
          <span className="shrink-0 text-xs text-neutral-400">
            {conversation.lastMessageAt ? formatConversationTimestamp(conversation.lastMessageAt) : ""}
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
  );
}
