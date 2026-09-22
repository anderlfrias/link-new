"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFavorites,
  isFavoriteEmoji as checkFavoriteEmoji,
  isFavoriteGif as checkFavoriteGif,
  isFavoriteSticker as checkFavoriteSticker,
  subscribeFavorites,
  toggleFavoriteEmoji as toggleEmoji,
  toggleFavoriteGif as toggleGif,
  toggleFavoriteSticker as toggleSticker,
  type FavoriteGif,
  type FavoriteSticker,
  type UserFavorites,
} from "@/features/messages/lib/favorites-store";

export function useFavorites(userId: string) {
  const [favorites, setFavorites] = useState<UserFavorites>(() => getFavorites(userId));

  useEffect(() => {
    setFavorites(getFavorites(userId));
    const unsubscribe = subscribeFavorites(userId, () => {
      setFavorites(getFavorites(userId));
    });
    return unsubscribe;
  }, [userId]);

  const isFavoriteEmoji = useCallback(
    (emoji: string) => checkFavoriteEmoji(userId, emoji),
    [userId],
  );

  const toggleFavoriteEmoji = useCallback(
    (emoji: string) => toggleEmoji(userId, emoji),
    [userId],
  );

  const isFavoriteGif = useCallback(
    (id: string) => checkFavoriteGif(userId, id),
    [userId],
  );

  const toggleFavoriteGif = useCallback(
    (gif: Omit<FavoriteGif, "addedAt">) => toggleGif(userId, gif),
    [userId],
  );

  const isFavoriteSticker = useCallback(
    (idOrFileId: string) => checkFavoriteSticker(userId, idOrFileId),
    [userId],
  );

  const toggleFavoriteSticker = useCallback(
    (sticker: Omit<FavoriteSticker, "addedAt">) => toggleSticker(userId, sticker),
    [userId],
  );

  return {
    favorites,
    isFavoriteEmoji,
    toggleFavoriteEmoji,
    isFavoriteGif,
    toggleFavoriteGif,
    isFavoriteSticker,
    toggleFavoriteSticker,
  };
}
