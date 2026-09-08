"use client";

import { useState } from "react";
import { EMOJI_CATEGORIES } from "@/features/messages/constants/emoji-data";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

/** Contenido del selector de emojis: tabs por categoría + grilla scrolleable
 * — sin marco propio (bordes/tamaño/sombra), pensado para vivir como una
 * pestaña más dentro de `EmojiGifStickerPicker.tsx`, que es quien pone el
 * marco. Llena el espacio del contenedor flex-col que lo envuelve. */
export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = EMOJI_CATEGORIES[activeCategory];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-black/5 px-1.5 py-1.5 dark:border-white/10">
        {EMOJI_CATEGORIES.map((cat, index) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => setActiveCategory(index)}
            aria-label={cat.label}
            aria-current={index === activeCategory}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition-colors ${
              index === activeCategory
                ? "bg-brand-blue/10 dark:bg-brand-blue/20"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-7 gap-0.5 overflow-y-auto p-2">
        {category.emojis.map((emoji, index) => (
          <button
            key={`${category.label}-${index}`}
            type="button"
            onClick={() => onSelect(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none hover:bg-black/5 dark:hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
