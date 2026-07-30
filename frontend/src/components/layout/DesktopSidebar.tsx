"use client";

import { useState } from "react";
import { IconMessage2Plus, IconSearch } from "@tabler/icons-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConversationList } from "@/features/conversations/components/ConversationList";
import { NewChatModal } from "@/features/users/components/NewChatModal";
import { ProfileSettingsPanel } from "@/features/profile/components/ProfileSettingsPanel";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

interface DesktopSidebarProps {
  conversations: ConversationListItem[];
  status: ConversationsStatus;
  currentUserId: string;
}

export function DesktopSidebar({ conversations, status, currentUserId }: DesktopSidebarProps) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "profileSettings">("list");
  const [showNewChat, setShowNewChat] = useState(false);

  if (view === "profileSettings") {
    return <ProfileSettingsPanel onClose={() => setView("list")} />;
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <UserMenu onOpenProfileSettings={() => setView("profileSettings")} />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            title="Chat nuevo"
            onClick={() => setShowNewChat(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
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
      <button
        type="button"
        title="Chat nuevo"
        onClick={() => setShowNewChat(true)}
        className="absolute bottom-5 right-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg transition-colors hover:bg-brand-blue-dark"
      >
        <IconMessage2Plus size={24} stroke={1.75} />
      </button>
      {showNewChat && (
        <Modal onClose={() => setShowNewChat(false)} aria-label="Chat nuevo">
          <NewChatModal onClose={() => setShowNewChat(false)} />
        </Modal>
      )}
    </div>
  );
}
