"use client";

import { useEffect, useRef, useState } from "react";
import { IconLoader2, IconSearch, IconStar, IconStarFilled } from "@tabler/icons-react";
import { EmojiPicker } from "@/features/messages/components/EmojiPicker";
import { getTrendingGiphy, searchGiphy } from "@/features/giphy/api/giphy.api";
import { ApiError } from "@/types/api.types";
import { useFavorites } from "@/features/messages/hooks/use-favorites";
import type { GiphyMediaKind, GiphySearchResult } from "@/features/giphy/types/giphy.types";
import type { FavoriteGif, FavoriteSticker } from "@/features/messages/lib/favorites-store";

interface EmojiGifStickerPickerProps {
  token: string;
  userId?: string;
  /** Si `AppSettings.allowStickersAndGifs` está apagado, solo se muestra la
   * pestaña Emojis — el resto del popover funciona igual. */
  showGifsAndStickers: boolean;
  /** Deshabilita la grilla de GIFs/stickers mientras se importa un resultado
   * elegido — evita mandar dos veces si tocás otro antes de que termine. */
  busy: boolean;
  onSelectEmoji: (emoji: string) => void;
  onSelectGifSticker: (kind: GiphyMediaKind, giphyId: string, originalUrl: string) => void;
  /** Permite enviar stickers que ya son archivos guardados en el servidor (ej. desde el chat) */
  onSelectStoredSticker?: (fileId: string) => void;
}

type Mode = "emojis" | "gifs" | "stickers" | "favorites";
type SubView = "trending" | "favorites";
type FavoritesCategory = "all" | "emojis" | "gifs" | "stickers";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "emojis", label: "Emojis" },
  { mode: "gifs", label: "GIFs" },
  { mode: "stickers", label: "Stickers" },
  { mode: "favorites", label: "Favoritos" },
];

const SEARCH_DEBOUNCE_MS = 300;

/** Un solo popover para emojis + GIFs + stickers (Giphy) y gestión de favoritos. */
export function EmojiGifStickerPicker({
  token,
  userId = "",
  showGifsAndStickers,
  busy,
  onSelectEmoji,
  onSelectGifSticker,
  onSelectStoredSticker,
}: EmojiGifStickerPickerProps) {
  const [mode, setMode] = useState<Mode>("emojis");
  const [subView, setSubView] = useState<SubView>("trending");
  const [favCategory, setFavCategory] = useState<FavoritesCategory>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphySearchResult[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const {
    favorites,
    toggleFavoriteEmoji,
    isFavoriteGif,
    toggleFavoriteGif,
    isFavoriteSticker,
    toggleFavoriteSticker,
  } = useFavorites(userId);

  useEffect(() => {
    if (mode === "emojis" || mode === "favorites") return;
    if (subView === "favorites") return;

    const requestId = ++requestIdRef.current;
    const trimmed = query.trim();
    setStatus("loading");

    const delay = trimmed ? SEARCH_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      const load = trimmed ? searchGiphy(token, mode, trimmed) : getTrendingGiphy(token, mode);
      load
        .then((data) => {
          if (requestIdRef.current !== requestId) return;
          setResults(data);
          setStatus("ready");
        })
        .catch((error) => {
          if (requestIdRef.current !== requestId) return;
          setErrorMessage(error instanceof ApiError ? error.message : null);
          setStatus("error");
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [token, mode, query, subView]);

  function handleSendSticker(sticker: FavoriteSticker) {
    if (sticker.fileId && onSelectStoredSticker) {
      onSelectStoredSticker(sticker.fileId);
      return;
    }
    onSelectGifSticker("stickers", sticker.id, sticker.originalUrl || sticker.previewUrl);
  }

  return (
    <div className="flex h-80 w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-black/5 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-900">
      {/* Pestañas principales */}
      <div className="flex shrink-0 gap-1 border-b border-black/5 px-2 pt-2 dark:border-white/10">
        {TABS.filter((tab) => tab.mode === "emojis" || showGifsAndStickers).map((tab) => (
          <button
            key={tab.mode}
            type="button"
            onClick={() => {
              setMode(tab.mode);
              setSubView("trending");
            }}
            aria-current={tab.mode === mode}
            className={`rounded-t-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              tab.mode === mode
                ? "border-b-2 border-brand-blue text-brand-blue dark:text-brand-blue-light"
                : "text-neutral-500 hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "emojis" && <EmojiPicker onSelect={onSelectEmoji} userId={userId} />}

      {mode === "favorites" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Selector de categoría de favoritos */}
          <div className="flex shrink-0 gap-1 border-b border-black/5 px-2 py-1.5 dark:border-white/10">
            {(["all", "emojis", "gifs", "stickers"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFavCategory(cat)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  favCategory === cat
                    ? "bg-brand-blue text-white"
                    : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20"
                }`}
              >
                {cat === "all"
                  ? "Todos"
                  : cat === "emojis"
                  ? `Emojis (${favorites.emojis.length})`
                  : cat === "gifs"
                  ? `GIFs (${favorites.gifs.length})`
                  : `Stickers (${favorites.stickers.length})`}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {/* Emojis favoritos */}
            {(favCategory === "all" || favCategory === "emojis") && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <span>Emojis favoritos</span>
                </div>
                {favorites.emojis.length === 0 ? (
                  <p className="text-[11px] text-neutral-400">Sin emojis favoritos.</p>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {favorites.emojis.map((emoji, index) => (
                      <button
                        key={`fav-emoji-${index}`}
                        type="button"
                        onClick={() => onSelectEmoji(emoji)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-110 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GIFs favoritos */}
            {(favCategory === "all" || favCategory === "gifs") && (
              <div className="mb-3">
                <div className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <span>GIFs favoritos</span>
                </div>
                {favorites.gifs.length === 0 ? (
                  <p className="text-[11px] text-neutral-400">Sin GIFs favoritos.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {favorites.gifs.map((gif) => (
                      <div key={gif.id} className="group relative aspect-square overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSelectGifSticker("gifs", gif.id, gif.originalUrl)}
                          className="h-full w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gif.previewUrl} alt={gif.title} className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteGif(gif);
                          }}
                          aria-label="Quitar de favoritos"
                          title="Quitar de favoritos"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-amber-400 shadow transition-transform hover:scale-110"
                        >
                          <IconStarFilled size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stickers favoritos */}
            {(favCategory === "all" || favCategory === "stickers") && (
              <div className="mb-2">
                <div className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  <span>Stickers favoritos</span>
                </div>
                {favorites.stickers.length === 0 ? (
                  <p className="text-[11px] text-neutral-400">Sin stickers favoritos.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {favorites.stickers.map((sticker) => (
                      <div key={sticker.id} className="group relative aspect-square overflow-hidden rounded-md p-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSendSticker(sticker)}
                          className="h-full w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={sticker.previewUrl} alt={sticker.title} className="h-full w-full object-contain" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteSticker(sticker);
                          }}
                          aria-label="Quitar de favoritos"
                          title="Quitar de favoritos"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-amber-400 shadow transition-transform hover:scale-110"
                        >
                          <IconStarFilled size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {(mode === "gifs" || mode === "stickers") && (
        <>
          {/* Barra de búsqueda y alternador de vista (Tendencias vs Favoritos) */}
          <div className="shrink-0 px-2 py-1.5">
            <div className="mb-1.5 flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-1 dark:border-white/10">
              <IconSearch size={14} stroke={1.75} className="shrink-0 text-neutral-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (subView !== "trending") setSubView("trending");
                }}
                placeholder={mode === "gifs" ? "Buscar GIFs" : "Buscar stickers"}
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:text-white"
              />
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSubView("trending")}
                className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                  subView === "trending"
                    ? "bg-black/10 text-brand-ink dark:bg-white/15 dark:text-white"
                    : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
                }`}
              >
                Tendencias
              </button>
              <button
                type="button"
                onClick={() => setSubView("favorites")}
                className={`flex items-center justify-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  subView === "favorites"
                    ? "bg-amber-400/20 text-amber-600 dark:bg-amber-400/30 dark:text-amber-400 font-semibold"
                    : "text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
                }`}
              >
                <IconStarFilled size={12} className="text-amber-500" />
                Favoritos (
                {mode === "gifs" ? favorites.gifs.length : favorites.stickers.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {subView === "favorites" ? (
              mode === "gifs" ? (
                favorites.gifs.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                    <IconStar size={24} className="mb-1 text-neutral-400" />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Sin GIFs favoritos.</p>
                    <p className="mt-1 text-[11px] text-neutral-400">Tocá la estrella ⭐ en cualquier GIF para guardarlo acá.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {favorites.gifs.map((gif) => (
                      <div key={gif.id} className="group relative aspect-square overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSelectGifSticker("gifs", gif.id, gif.originalUrl)}
                          className="h-full w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={gif.previewUrl} alt={gif.title} className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteGif(gif);
                          }}
                          aria-label="Quitar de favoritos"
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-amber-400 shadow transition-transform hover:scale-110"
                        >
                          <IconStarFilled size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : favorites.stickers.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <IconStar size={24} className="mb-1 text-neutral-400" />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Sin stickers favoritos.</p>
                  <p className="mt-1 text-[11px] text-neutral-400">Tocá la estrella ⭐ en un sticker para guardarlo acá.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1">
                  {favorites.stickers.map((sticker) => (
                    <div key={sticker.id} className="group relative aspect-square overflow-hidden rounded-md p-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSendSticker(sticker)}
                        className="h-full w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sticker.previewUrl} alt={sticker.title} className="h-full w-full object-contain" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteSticker(sticker);
                        }}
                        aria-label="Quitar de favoritos"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-amber-400 shadow transition-transform hover:scale-110"
                      >
                        <IconStarFilled size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
                {status === "loading" && (
                  <div className="flex h-full items-center justify-center text-neutral-400">
                    <IconLoader2 size={20} className="animate-spin" />
                  </div>
                )}
                {status === "error" && (
                  <p className="p-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    {errorMessage ?? "No se pudo cargar. Probá de nuevo."}
                  </p>
                )}
                {status === "ready" && results.length === 0 && (
                  <p className="p-2 text-center text-xs text-neutral-500 dark:text-neutral-400">Sin resultados.</p>
                )}
                {status === "ready" && results.length > 0 && (
                  <div className="grid grid-cols-3 gap-1">
                    {results.map((result) => {
                      const isFav =
                        mode === "gifs"
                          ? isFavoriteGif(result.id)
                          : isFavoriteSticker(result.id);

                      return (
                        <div
                          key={result.id}
                          className={`group relative aspect-square overflow-hidden rounded-md transition-opacity hover:opacity-95 ${
                            mode === "stickers" ? "p-1" : "bg-black/5 dark:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onSelectGifSticker(mode, result.id, result.originalUrl)}
                            className="h-full w-full disabled:opacity-40"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={result.previewUrl}
                              alt={result.title}
                              className={`h-full w-full ${mode === "stickers" ? "object-contain" : "object-cover"}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mode === "gifs") {
                                toggleFavoriteGif({
                                  id: result.id,
                                  title: result.title,
                                  previewUrl: result.previewUrl,
                                  originalUrl: result.originalUrl,
                                  width: result.width,
                                  height: result.height,
                                });
                              } else {
                                toggleFavoriteSticker({
                                  id: result.id,
                                  title: result.title,
                                  previewUrl: result.previewUrl,
                                  originalUrl: result.originalUrl,
                                });
                              }
                            }}
                            aria-label={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                            className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 shadow transition-transform hover:scale-110 ${
                              isFav ? "text-amber-400" : "text-white/80 opacity-0 group-hover:opacity-100 hover:text-white"
                            }`}
                          >
                            {isFav ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
