"use client";

import { cn } from "@/utils/cn";
import { useTranslation } from "@/i18n";
import type { ConversationFilter } from "@/features/conversations/types/conversation.types";

interface ConversationFilterBarProps {
  active: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
}

export function ConversationFilterBar({ active, onChange }: ConversationFilterBarProps) {
  const { t } = useTranslation();

  const filters: { value: ConversationFilter; label: string }[] = [
    { value: "all", label: t("chatList.filterAll") },
    { value: "unread", label: t("chatList.filterUnread") },
    { value: "groups", label: t("chatList.filterGroups") },
    { value: "favorites", label: t("chatList.filterFavorites") },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => onChange(filter.value)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            active === filter.value
              ? "bg-brand-blue text-white"
              : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
