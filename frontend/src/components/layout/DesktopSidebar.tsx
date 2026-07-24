"use client";

import { useState } from "react";
import { IconMessage2Plus, IconSearch } from "@tabler/icons-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Input } from "@/components/ui/Input";
import { ConversationList } from "@/features/conversations/components/ConversationList";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

interface DesktopSidebarProps {
  conversations: ConversationListItem[];
  status: ConversationsStatus;
  currentUserId: string;
}

export function DesktopSidebar({ conversations, status, currentUserId }: DesktopSidebarProps) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <UserMenu />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            title="Nuevo chat (próximamente)"
            disabled
            className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-neutral-400 dark:text-neutral-500"
          >
            <IconMessage2Plus size={20} stroke={1.75} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <Input
          icon={<IconSearch size={16} stroke={1.75} />}
          placeholder="Buscar conversación"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <ConversationList
        conversations={conversations}
        status={status}
        searchQuery={search}
        currentUserId={currentUserId}
      />
    </div>
  );
}
