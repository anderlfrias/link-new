"use client";

import { useState } from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { EMOJI_CATEGORIES } from "@/features/messages/constants/emoji-data";
import { useFavorites } from "@/features/messages/hooks/use-favorites";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  userId?: string;
}

/** Contenido del selector de emojis: tabs por categoría + grilla scrolleable
 * — sin marco propio (bordes/tamaño/sombra), pensado para vivir como una
 * pestaña más dentro de `EmojiGifStickerPicker.tsx`, que es quien pone el
 * marco. Llena el espacio del contenedor flex-col que lo envuelve. */
export function EmojiPicker({ onSelect, userId = "" }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<number | "favorites">(0);
  const [isEditingFavorites, setIsEditingFavorites] = useState(false);
  const { favorites, isFavoriteEmoji, toggleFavoriteEmoji } = useFavorites(userId);

  const isFavorites = activeCategory === "favorites";
  const category = !isFavorites ? EMOJI_CATEGORIES[activeCategory] : null;
  const currentEmojis = isFavorites ? favorites.emojis : (category?.emojis ?? []);

  function handleEmojiClick(emoji: string) {
    if (isEditingFavorites) {
      toggleFavoriteEmoji(emoji);
      return;
    }
    onSelect(emoji);
  }

  function handleEmojiContextMenu(event: React.MouseEvent, emoji: string) {
    event.preventDefault();
    toggleFavoriteEmoji(emoji);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-1.5 py-1.5 dark:border-white/10">
        <div className="flex shrink-0 gap-0.5 overflow-x-auto">
          {/* Pestaña de Favoritos */}
          <button
            type="button"
            onClick={() => setActiveCategory("favorites")}
            aria-label="Emojis favoritos"
            aria-current={isFavorites}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition-colors ${
              isFavorites
                ? "bg-amber-400/20 text-amber-500 dark:bg-amber-400/30 dark:text-amber-400"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            <span>⭐</span>
          </button>

          {EMOJI_CATEGORIES.map((cat, index) => (
            <button
              key={cat.label}
              type="button"
              onClick={() => setActiveCategory(index)}
              aria-label={cat.label}
              aria-current={activeCategory === index}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition-colors ${
                activeCategory === index
                  ? "bg-brand-blue/10 dark:bg-brand-blue/20"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {cat.icon}
            </button>
          ))}
        </div>

        {/* Botón para alternar modo edición de favoritos */}
        <button
          type="button"
          onClick={() => setIsEditingFavorites((prev) => !prev)}
          title={
            isEditingFavorites
              ? "Modo edición activo: tocá cualquier emoji para agregarlo/quitarlo de favoritos"
              : "Editar favoritos: tocar para marcar/desmarcar emojis favoritos"
          }
          aria-label={isEditingFavorites ? "Finalizar edición de favoritos" : "Editar favoritos"}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
            isEditingFavorites
              ? "bg-amber-500 text-white shadow-sm"
              : "text-neutral-400 hover:bg-black/5 hover:text-amber-500 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-amber-400"
          }`}
        >
          {isEditingFavorites ? <IconStarFilled size={15} /> : <IconStar size={15} />}
        </button>
      </div>

      {isEditingFavorites && (
        <div className="bg-amber-50 px-2 py-1 text-center text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Tocá cualquier emoji para agregarlo o quitarlo de favoritos
        </div>
      )}

      {isFavorites && currentEmojis.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <IconStar size={28} className="mb-2 text-neutral-400 dark:text-neutral-500" stroke={1.5} />
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Sin emojis favoritos
          </p>
          <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            Hacé clic derecho en cualquier emoji o activá el botón ⭐ arriba para guardarlos acá.
          </p>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-7 gap-0.5 overflow-y-auto p-2">
          {currentEmojis.map((emoji, index) => {
            const isFav = isFavoriteEmoji(emoji);
            return (
              <button
                key={`${isFavorites ? "fav" : category?.label}-${index}`}
                type="button"
                onClick={() => handleEmojiClick(emoji)}
                onContextMenu={(e) => handleEmojiContextMenu(e, emoji)}
                title={isFav ? "Favorito (clic derecho para quitar)" : "Clic derecho para agregar a favoritos"}
                className={`relative flex h-9 w-9 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-110 hover:bg-black/5 dark:hover:bg-white/10 ${
                  isEditingFavorites && isFav ? "ring-2 ring-amber-400" : ""
                }`}
              >
                {emoji}
                {isFav && (
                  <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
