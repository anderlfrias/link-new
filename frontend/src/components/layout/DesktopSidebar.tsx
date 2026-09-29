"use client";

import { useState } from "react";
import { IconBookmark, IconLoader2, IconMessage2Plus, IconSearch } from "@tabler/icons-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConversationFilterBar } from "@/features/conversations/components/ConversationFilterBar";
import { ConversationList } from "@/features/conversations/components/ConversationList";
import { NewChatModal } from "@/features/users/components/NewChatModal";
import { ProfileSettingsPanel } from "@/features/profile/components/ProfileSettingsPanel";
import { useOpenSelfChat } from "@/features/conversations/hooks/use-open-self-chat";
import { useTranslation } from "@/i18n";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type { ConversationFilter, ConversationListItem } from "@/features/conversations/types/conversation.types";

interface DesktopSidebarProps {
  conversations: ConversationListItem[];
  status: ConversationsStatus;
  currentUserId: string;
}

export function DesktopSidebar({ conversations, status, currentUserId }: DesktopSidebarProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("all");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [view, setView] = useState<"list" | "profileSettings">("list");
  const [showNewChat, setShowNewChat] = useState(false);
  const { open: openSelfChat, pending: openingSelfChat } = useOpenSelfChat();

  if (view === "profileSettings") {
    return <ProfileSettingsPanel onClose={() => setView("list")} />;
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <UserMenu onOpenProfileSettings={() => setView("profileSettings")} />
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectorial, no pasa por el optimizador de next/image */}
          <img src="/brand/logo-wordmark.svg" alt="Link" className="h-6 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element -- idem, variante para fondo oscuro */}
          <img src="/brand/logo-wordmark-dark.svg" alt="" aria-hidden="true" className="hidden h-6 w-auto dark:block" />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            title={t("chatList.savedMessages")}
            disabled={openingSelfChat}
            onClick={() => void openSelfChat()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {openingSelfChat ? (
              <IconLoader2 size={20} stroke={1.75} className="animate-spin" />
            ) : (
              <IconBookmark size={20} stroke={1.75} />
            )}
          </button>
          <button
            type="button"
            title={t("modals.newChatTitle")}
            onClick={() => setShowNewChat(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconMessage2Plus size={20} stroke={1.75} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-2">
        <Input
          icon={<IconSearch size={16} stroke={1.75} />}
          placeholder={t("chatList.searchConversation")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ConversationFilterBar active={activeFilter} onChange={setActiveFilter} />
      </div>
      <ConversationList
        conversations={conversations}
        status={status}
        searchQuery={search}
        activeFilter={activeFilter}
        currentUserId={currentUserId}
        isSelectionMode={isSelectionMode}
        onExitSelectionMode={() => setIsSelectionMode(false)}
        onEnterSelectionMode={() => setIsSelectionMode(true)}
      />
      <button
        type="button"
        title={t("modals.newChatTitle")}
        onClick={() => setShowNewChat(true)}
        className="absolute bottom-5 right-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue text-white shadow-lg transition-colors hover:bg-brand-blue-dark"
      >
        <IconMessage2Plus size={24} stroke={1.75} />
      </button>
      {showNewChat && (
        <Modal onClose={() => setShowNewChat(false)} aria-label={t("modals.newChatTitle")}>
          <NewChatModal onClose={() => setShowNewChat(false)} />
        </Modal>
      )}
    </div>
  );
}
