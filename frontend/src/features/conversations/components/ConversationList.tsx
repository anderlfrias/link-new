"use client";

import { useMemo } from "react";
import { IconLoader2, IconMessageCircle2 } from "@tabler/icons-react";
import { ConversationListItem } from "@/features/conversations/components/ConversationListItem";
import { getConversationDisplayName } from "@/utils/conversation-display";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type { ConversationListItem as ConversationListItemType } from "@/features/conversations/types/conversation.types";

interface ConversationListProps {
  conversations: ConversationListItemType[];
  status: ConversationsStatus;
  searchQuery: string;
  currentUserId: string;
}

export function ConversationList({
  conversations,
  status,
  searchQuery,
  currentUserId,
}: ConversationListProps) {
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      getConversationDisplayName(conversation, currentUserId).toLowerCase().includes(query),
    );
  }, [conversations, searchQuery, currentUserId]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={24} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No se pudieron cargar tus conversaciones.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <IconMessageCircle2 size={32} className="text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {searchQuery ? "Sin resultados" : "Todavía no tenés conversaciones"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {filtered.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}
