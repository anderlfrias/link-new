/**
 * Almacén de favoritos de mensajes (Emojis, GIFs y Stickers).
 *
 * Persiste los elementos favoritos en localStorage de forma aislada por usuario,
 * y provee suscripción reactiva para sincronizar en tiempo real el selector
 * (EmojiGifStickerPicker / EmojiPicker) y las opciones de los mensajes (MessageBubble).
 */

export interface FavoriteGif {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width?: number;
  height?: number;
  addedAt: number;
}

export interface FavoriteSticker {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl?: string;
  fileId?: string;
  addedAt: number;
}

export interface UserFavorites {
  emojis: string[];
  gifs: FavoriteGif[];
  stickers: FavoriteSticker[];
}

export const DEFAULT_FAVORITE_EMOJIS: string[] = [
  "👍", "❤️", "😂", "🎉", "🔥", "🙏", "👏", "😊", "😍", "✨"
];

type Listener = () => void;

const cache = new Map<string, UserFavorites>();
const listeners = new Map<string, Set<Listener>>();

function getStorageKey(userId: string): string {
  return `link_favorites_${userId}`;
}

function getDefaultFavorites(): UserFavorites {
  return {
    emojis: [...DEFAULT_FAVORITE_EMOJIS],
    gifs: [],
    stickers: [],
  };
}

function readFavoritesFromStorage(userId: string): UserFavorites {
  if (!userId) return getDefaultFavorites();
  if (cache.has(userId)) {
    return cache.get(userId)!;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    const defaults = getDefaultFavorites();
    cache.set(userId, defaults);
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      const defaults = getDefaultFavorites();
      cache.set(userId, defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const favs: UserFavorites = {
        emojis: Array.isArray(parsed.emojis) ? parsed.emojis : [...DEFAULT_FAVORITE_EMOJIS],
        gifs: Array.isArray(parsed.gifs) ? parsed.gifs : [],
        stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
      };
      cache.set(userId, favs);
      return favs;
    }
  } catch {
    // Ignorar JSON corrupto
  }
  const fallback = getDefaultFavorites();
  cache.set(userId, fallback);
  return fallback;
}

function writeFavoritesToStorage(userId: string, favorites: UserFavorites): void {
  cache.set(userId, favorites);
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const key = getStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(favorites));
  } catch {
    // Ignorar almacenamiento lleno o deshabilitado
  }
}

function notifySubscribers(userId: string): void {
  const subs = listeners.get(userId);
  if (subs) {
    subs.forEach((cb) => {
      try {
        cb();
      } catch {
        // Evitar que el error de un listener bloquee a los demás
      }
    });
  }
}

/**
 * Obtiene los favoritos actuales para un usuario dado.
 */
export function getFavorites(userId: string): UserFavorites {
  return readFavoritesFromStorage(userId);
}

/**
 * Verifica si un emoji es favorito para el usuario.
 */
export function isFavoriteEmoji(userId: string, emoji: string): boolean {
  if (!userId || !emoji) return false;
  const favs = readFavoritesFromStorage(userId);
  return favs.emojis.includes(emoji);
}

/**
 * Alterna un emoji en favoritos. Retorna true si fue agregado, false si fue removido.
 */
export function toggleFavoriteEmoji(userId: string, emoji: string): boolean {
  if (!userId || !emoji) return false;
  const favs = { ...readFavoritesFromStorage(userId) };
  const exists = favs.emojis.includes(emoji);
  let isAdded: boolean;

  if (exists) {
    favs.emojis = favs.emojis.filter((e) => e !== emoji);
    isAdded = false;
  } else {
    favs.emojis = [emoji, ...favs.emojis];
    isAdded = true;
  }

  writeFavoritesToStorage(userId, favs);
  notifySubscribers(userId);
  return isAdded;
}

/**
 * Verifica si un GIF es favorito por su ID.
 */
export function isFavoriteGif(userId: string, id: string): boolean {
  if (!userId || !id) return false;
  const favs = readFavoritesFromStorage(userId);
  return favs.gifs.some((g) => g.id === id);
}

/**
 * Alterna un GIF en favoritos.
 */
export function toggleFavoriteGif(
  userId: string,
  gif: Omit<FavoriteGif, "addedAt">,
): boolean {
  if (!userId || !gif.id) return false;
  const favs = { ...readFavoritesFromStorage(userId) };
  const index = favs.gifs.findIndex((g) => g.id === gif.id);
  let isAdded: boolean;

  if (index >= 0) {
    favs.gifs = favs.gifs.filter((g) => g.id !== gif.id);
    isAdded = false;
  } else {
    favs.gifs = [{ ...gif, addedAt: Date.now() }, ...favs.gifs];
    isAdded = true;
  }

  writeFavoritesToStorage(userId, favs);
  notifySubscribers(userId);
  return isAdded;
}

/**
 * Verifica si un sticker es favorito por su ID o fileId.
 */
export function isFavoriteSticker(userId: string, idOrFileId: string): boolean {
  if (!userId || !idOrFileId) return false;
  const favs = readFavoritesFromStorage(userId);
  return favs.stickers.some((s) => s.id === idOrFileId || (s.fileId && s.fileId === idOrFileId));
}

/**
 * Alterna un sticker en favoritos.
 */
export function toggleFavoriteSticker(
  userId: string,
  sticker: Omit<FavoriteSticker, "addedAt">,
): boolean {
  if (!userId || !sticker.id) return false;
  const favs = { ...readFavoritesFromStorage(userId) };
  const index = favs.stickers.findIndex(
    (s) => s.id === sticker.id || (sticker.fileId && s.fileId === sticker.fileId),
  );
  let isAdded: boolean;

  if (index >= 0) {
    favs.stickers = favs.stickers.filter(
      (s) => s.id !== sticker.id && (!sticker.fileId || s.fileId !== sticker.fileId),
    );
    isAdded = false;
  } else {
    favs.stickers = [{ ...sticker, addedAt: Date.now() }, ...favs.stickers];
    isAdded = true;
  }

  writeFavoritesToStorage(userId, favs);
  notifySubscribers(userId);
  return isAdded;
}

/**
 * Suscribe un callback a los cambios de favoritos de un usuario.
 */
export function subscribeFavorites(userId: string, callback: Listener): () => void {
  if (!userId) return () => {};

  if (!listeners.has(userId)) {
    listeners.set(userId, new Set());
  }
  const set = listeners.get(userId)!;
  set.add(callback);

  return () => {
    set.delete(callback);
    if (set.size === 0) {
      listeners.delete(userId);
    }
  };
}

/**
 * Limpia la caché en memoria (para tests o logout).
 */
export function resetFavoritesCache(): void {
  cache.clear();
  listeners.clear();
}

// Sincronización entre pestañas mediante el evento 'storage'
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith("link_favorites_")) {
      const userId = event.key.replace("link_favorites_", "");
      cache.delete(userId);
      notifySubscribers(userId);
    }
  });
}
