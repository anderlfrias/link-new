"use client";

import { useMemo } from "react";
import type { MessageReaction } from "@/features/messages/types/message.types";
import { cn } from "@/utils/cn";

interface MessageReactionsListProps {
  reactions?: MessageReaction[];
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  className?: string;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  hasReacted: boolean;
  userNames: string[];
}

export function MessageReactionsList({
  reactions = [],
  currentUserId,
  onToggleReaction,
  className,
}: MessageReactionsListProps) {
  const groups = useMemo<ReactionGroup[]>(() => {
    if (!reactions || reactions.length === 0) return [];

    const map = new Map<string, ReactionGroup>();
    for (const r of reactions) {
      let group = map.get(r.emoji);
      if (!group) {
        group = {
          emoji: r.emoji,
          count: 0,
          hasReacted: false,
          userNames: [],
        };
        map.set(r.emoji, group);
      }
      group.count += 1;
      if (r.userId === currentUserId) {
        group.hasReacted = true;
      }
      const displayName = r.userId === currentUserId ? "Vos" : (r.userName || "Alguien");
      group.userNames.push(displayName);
    }

    return Array.from(map.values());
  }, [reactions, currentUserId]);

  if (groups.length === 0) return null;

  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-1", className)}>
      {groups.map((group) => {
        const tooltip = group.userNames.join(", ");
        return (
          <button
            key={group.emoji}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleReaction(group.emoji);
            }}
            title={tooltip}
            aria-label={`${group.count} reacciones con ${group.emoji}: ${tooltip}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all duration-150 active:scale-95",
              group.hasReacted
                ? "border-brand-blue/30 bg-brand-blue/15 text-brand-blue dark:border-brand-blue/50 dark:bg-brand-blue/25 dark:text-blue-300 font-medium shadow-xs"
                : "border-black/5 bg-black/5 hover:bg-black/10 text-neutral-700 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15 dark:text-neutral-300",
            )}
          >
            <span className="text-[13px] leading-none">{group.emoji}</span>
            <span className="text-[11px] font-semibold leading-none">{group.count}</span>
          </button>
        );
      })}
    </div>
  );
}
