"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

interface QuickReactionPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose?: () => void;
  align?: "left" | "right";
  className?: string;
}

export function QuickReactionPicker({
  onSelectEmoji,
  onClose,
  align = "left",
  className,
}: QuickReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClose) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Reacciones rápidas"
      className={cn(
        "z-30 flex items-center gap-0.5 rounded-full border border-black/10 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur-md dark:border-white/15 dark:bg-neutral-800/95 animate-in fade-in zoom-in-95 duration-150",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectEmoji(emoji);
            onClose?.();
          }}
          aria-label={`Reaccionar con ${emoji}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform duration-150 hover:scale-135 hover:bg-black/5 active:scale-95 dark:hover:bg-white/10"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
