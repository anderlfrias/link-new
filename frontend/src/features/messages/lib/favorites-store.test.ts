import { describe, it, expect, beforeEach } from "vitest";
import {
  getFavorites,
  isFavoriteEmoji,
  toggleFavoriteEmoji,
  isFavoriteGif,
  toggleFavoriteGif,
  isFavoriteSticker,
  toggleFavoriteSticker,
  subscribeFavorites,
  resetFavoritesCache,
  DEFAULT_FAVORITE_EMOJIS,
} from "./favorites-store";

describe("favorites-store", () => {
  const userId = "user-123";
  const otherUserId = "user-456";

  beforeEach(() => {
    localStorage.clear();
    resetFavoritesCache();
  });

  it("returns default favorite emojis for new user", () => {
    const favs = getFavorites(userId);
    expect(favs.emojis).toEqual(DEFAULT_FAVORITE_EMOJIS);
    expect(favs.gifs).toEqual([]);
    expect(favs.stickers).toEqual([]);
  });

  it("toggles favorite emoji correctly and notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = subscribeFavorites(userId, () => {
      notified++;
    });

    expect(isFavoriteEmoji(userId, "🚀")).toBe(false);

    // Add emoji
    const added = toggleFavoriteEmoji(userId, "🚀");
    expect(added).toBe(true);
    expect(isFavoriteEmoji(userId, "🚀")).toBe(true);
    expect(notified).toBe(1);

    // Check localStorage
    const saved = JSON.parse(localStorage.getItem(`link_favorites_${userId}`)!);
    expect(saved.emojis).toContain("🚀");

    // Remove emoji
    const removed = toggleFavoriteEmoji(userId, "🚀");
    expect(removed).toBe(false);
    expect(isFavoriteEmoji(userId, "🚀")).toBe(false);
    expect(notified).toBe(2);

    unsubscribe();
  });

  it("toggles favorite GIF correctly and persists data", () => {
    const mockGif = {
      id: "gif-1",
      title: "Dancing Cat",
      previewUrl: "https://giphy.com/cat-prev.gif",
      originalUrl: "https://giphy.com/cat-orig.gif",
    };

    expect(isFavoriteGif(userId, "gif-1")).toBe(false);

    const added = toggleFavoriteGif(userId, mockGif);
    expect(added).toBe(true);
    expect(isFavoriteGif(userId, "gif-1")).toBe(true);

    const favs = getFavorites(userId);
    expect(favs.gifs).toHaveLength(1);
    expect(favs.gifs[0].id).toBe("gif-1");
    expect(favs.gifs[0].title).toBe("Dancing Cat");
    expect(favs.gifs[0].addedAt).toBeDefined();

    // Remove
    const removed = toggleFavoriteGif(userId, mockGif);
    expect(removed).toBe(false);
    expect(isFavoriteGif(userId, "gif-1")).toBe(false);
    expect(getFavorites(userId).gifs).toHaveLength(0);
  });

  it("toggles favorite sticker correctly (supports giphy and chat stickers)", () => {
    const giphySticker = {
      id: "sticker-1",
      title: "Cool Sticker",
      previewUrl: "https://giphy.com/stk.webp",
      originalUrl: "https://giphy.com/stk-orig.webp",
    };

    const chatSticker = {
      id: "file-xyz",
      title: "Sticker",
      previewUrl: "/uploads/file-xyz.webp",
      fileId: "file-xyz",
    };

    // Add giphy sticker
    expect(toggleFavoriteSticker(userId, giphySticker)).toBe(true);
    expect(isFavoriteSticker(userId, "sticker-1")).toBe(true);

    // Add chat sticker
    expect(toggleFavoriteSticker(userId, chatSticker)).toBe(true);
    expect(isFavoriteSticker(userId, "file-xyz")).toBe(true);

    const favs = getFavorites(userId);
    expect(favs.stickers).toHaveLength(2);

    // Remove chat sticker by fileId / id
    expect(toggleFavoriteSticker(userId, chatSticker)).toBe(false);
    expect(isFavoriteSticker(userId, "file-xyz")).toBe(false);
    expect(getFavorites(userId).stickers).toHaveLength(1);
  });

  it("isolates favorites per user", () => {
    toggleFavoriteEmoji(userId, "🚀");
    toggleFavoriteEmoji(otherUserId, "🍕");

    expect(isFavoriteEmoji(userId, "🚀")).toBe(true);
    expect(isFavoriteEmoji(userId, "🍕")).toBe(false);

    expect(isFavoriteEmoji(otherUserId, "🚀")).toBe(false);
    expect(isFavoriteEmoji(otherUserId, "🍕")).toBe(true);
  });

  it("handles corrupted JSON gracefully without crashing", () => {
    localStorage.setItem(`link_favorites_${userId}`, "{invalid-json");
    resetFavoritesCache();

    const favs = getFavorites(userId);
    expect(favs.emojis).toEqual(DEFAULT_FAVORITE_EMOJIS);
    expect(favs.gifs).toEqual([]);
    expect(favs.stickers).toEqual([]);
  });
});
