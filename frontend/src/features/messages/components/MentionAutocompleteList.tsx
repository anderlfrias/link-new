"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/utils/cn";

export interface MentionCandidate {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
}

interface MentionAutocompleteListProps {
  candidates: MentionCandidate[];
  selectedIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
}

export function MentionAutocompleteList({
  candidates,
  selectedIndex,
  onSelect,
}: MentionAutocompleteListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedElement = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (selectedElement && typeof selectedElement.scrollIntoView === "function") {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (candidates.length === 0) return null;

  return (
    <div
      className="absolute bottom-full mb-2 left-0 right-0 sm:right-auto sm:w-80 max-h-60 overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-xl z-30 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
      data-testid="mention-autocomplete-list"
    >
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Mencionar usuario
      </div>
      <ul ref={listRef} role="listbox" aria-label="Sugerencias de mención" className="divide-y divide-transparent">
        {candidates.map((candidate, idx) => {
          const isSelected = idx === selectedIndex;
          const displayHandle = candidate.username ? `@${candidate.username}` : null;

          return (
            <li
              key={candidate.id}
              role="option"
              aria-selected={isSelected}
              onMouseDown={(e) => {
                // Prevenir que el textarea pierda el foco
                e.preventDefault();
                onSelect(candidate);
              }}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-sm select-none",
                isSelected
                  ? "bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-blue-light font-medium"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-800 dark:text-neutral-200",
              )}
            >
              <Avatar name={candidate.name} imageUrl={candidate.avatarUrl} size="sm" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate leading-snug">{candidate.name}</span>
                {displayHandle && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate font-normal">
                    {displayHandle}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
