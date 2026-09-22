import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavorites } from "./use-favorites";
import { resetFavoritesCache } from "@/features/messages/lib/favorites-store";

describe("useFavorites", () => {
  const userId = "test-user-1";

  beforeEach(() => {
    localStorage.clear();
    resetFavoritesCache();
  });

  it("returns initial favorites and reacts to emoji toggling", () => {
    const { result } = renderHook(() => useFavorites(userId));

    expect(result.current.isFavoriteEmoji("🍕")).toBe(false);

    act(() => {
      const added = result.current.toggleFavoriteEmoji("🍕");
      expect(added).toBe(true);
    });

    expect(result.current.isFavoriteEmoji("🍕")).toBe(true);
    expect(result.current.favorites.emojis).toContain("🍕");

    act(() => {
      const removed = result.current.toggleFavoriteEmoji("🍕");
      expect(removed).toBe(false);
    });

    expect(result.current.isFavoriteEmoji("🍕")).toBe(false);
    expect(result.current.favorites.emojis).not.toContain("🍕");
  });

  it("handles gif and sticker favorites", () => {
    const { result } = renderHook(() => useFavorites(userId));

    const gif = {
      id: "g-100",
      title: "Wow",
      previewUrl: "https://giphy.com/p.gif",
      originalUrl: "https://giphy.com/o.gif",
    };

    act(() => {
      result.current.toggleFavoriteGif(gif);
    });

    expect(result.current.isFavoriteGif("g-100")).toBe(true);
    expect(result.current.favorites.gifs).toHaveLength(1);

    const sticker = {
      id: "stk-200",
      title: "Thumbs Up",
      previewUrl: "https://giphy.com/s.webp",
      originalUrl: "https://giphy.com/so.webp",
    };

    act(() => {
      result.current.toggleFavoriteSticker(sticker);
    });

    expect(result.current.isFavoriteSticker("stk-200")).toBe(true);
    expect(result.current.favorites.stickers).toHaveLength(1);
  });
});
