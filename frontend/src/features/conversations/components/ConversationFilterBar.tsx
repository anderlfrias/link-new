"use client";

import { cn } from "@/utils/cn";
import type { ConversationFilter } from "@/features/conversations/types/conversation.types";

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "unread", label: "No leídos" },
  { value: "groups", label: "Grupos" },
  { value: "favorites", label: "Favoritos" },
];

interface ConversationFilterBarProps {
  active: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
}

export function ConversationFilterBar({ active, onChange }: ConversationFilterBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {FILTERS.map((filter) => (
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
