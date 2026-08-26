"use client";

import { useMemo, useState } from "react";
import { IconLoader2, IconMessageCircle2 } from "@tabler/icons-react";
import { ConversationListItem } from "@/features/conversations/components/ConversationListItem";
import { useSetConversationPreference } from "@/features/conversations/hooks/use-set-conversation-preference";
import { getConversationDisplayName } from "@/utils/conversation-display";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type {
  ConversationFilter,
  ConversationListItem as ConversationListItemType,
} from "@/features/conversations/types/conversation.types";

interface ConversationListProps {
  conversations: ConversationListItemType[];
  status: ConversationsStatus;
  searchQuery: string;
  activeFilter: ConversationFilter;
  currentUserId: string;
}

export function ConversationList({
  conversations,
  status,
  searchQuery,
  activeFilter,
  currentUserId,
}: ConversationListProps) {
  const { setPinned, setFavorite, pendingId } = useSetConversationPreference();
  // Un solo menú de opciones abierto a la vez — vive acá (no en cada fila)
  // para que abrir el de un chat cierre el de cualquier otro automáticamente.
  const [openMenuConversationId, setOpenMenuConversationId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (query && !getConversationDisplayName(conversation, currentUserId).toLowerCase().includes(query)) {
        return false;
      }
      if (activeFilter === "unread" && conversation.unreadCount === 0) return false;
      if (activeFilter === "groups" && conversation.type !== "GROUP") return false;
      if (activeFilter === "favorites" && !conversation.isFavoritedByMe) return false;
      return true;
    });
    // El orden ya viene de `conversations` (fijadas primero, server-side) —
    // `.filter()` lo preserva, no hace falta reordenar acá.
  }, [conversations, searchQuery, activeFilter, currentUserId]);

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
          {searchQuery || activeFilter !== "all" ? "Sin resultados" : "Todavía no tenés conversaciones"}
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
          pending={pendingId === conversation.id}
          menuOpen={openMenuConversationId === conversation.id}
          onOpenMenu={() => setOpenMenuConversationId(conversation.id)}
          onCloseMenu={() => setOpenMenuConversationId((prev) => (prev === conversation.id ? null : prev))}
          onTogglePin={setPinned}
          onToggleFavorite={setFavorite}
        />
      ))}
    </div>
  );
}
