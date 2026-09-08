"use client";

import { useEffect, useRef, useState } from "react";
import { IconLoader2, IconSearch } from "@tabler/icons-react";
import { EmojiPicker } from "@/features/messages/components/EmojiPicker";
import { getTrendingGiphy, searchGiphy } from "@/features/giphy/api/giphy.api";
import { ApiError } from "@/types/api.types";
import type { GiphyMediaKind, GiphySearchResult } from "@/features/giphy/types/giphy.types";

interface EmojiGifStickerPickerProps {
  token: string;
  /** Si `AppSettings.allowStickersAndGifs` está apagado, solo se muestra la
   * pestaña Emojis — el resto del popover funciona igual. */
  showGifsAndStickers: boolean;
  /** Deshabilita la grilla de GIFs/stickers mientras se importa un resultado
   * elegido — evita mandar dos veces si tocás otro antes de que termine. */
  busy: boolean;
  onSelectEmoji: (emoji: string) => void;
  onSelectGifSticker: (kind: GiphyMediaKind, giphyId: string, originalUrl: string) => void;
}

type Mode = "emojis" | GiphyMediaKind;

const TABS: { mode: Mode; label: string }[] = [
  { mode: "emojis", label: "Emojis" },
  { mode: "gifs", label: "GIFs" },
  { mode: "stickers", label: "Stickers" },
];

const SEARCH_DEBOUNCE_MS = 300;

/** Un solo popover para emojis + GIFs + stickers (Giphy) — mismo trigger,
 * mismo marco, tabs para elegir qué mostrar (igual que WhatsApp/Telegram/
 * Messenger, que unifican los tres detrás de un solo ícono). La pestaña
 * "Emojis" reusa `EmojiPicker.tsx` (sin su propio marco, ver ese archivo);
 * "GIFs"/"Stickers" comparten la misma lógica de búsqueda con debounce que
 * antes vivía en `GifStickerPicker.tsx` (retirado, esta es su sucesora). */
export function EmojiGifStickerPicker({
  token,
  showGifsAndStickers,
  busy,
  onSelectEmoji,
  onSelectGifSticker,
}: EmojiGifStickerPickerProps) {
  const [mode, setMode] = useState<Mode>("emojis");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphySearchResult[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (mode === "emojis") return;
    const requestId = ++requestIdRef.current;
    const trimmed = query.trim();
    setStatus("loading");

    // Debounce solo para búsquedas con texto — las tendencias (al cambiar de
    // tab, o al vaciar el campo) se piden de una, no hay nada que tipear. El
    // propio fetch arranca DENTRO del timeout (no antes): si se dispara antes,
    // cada tecla tipeada lanza su propio request de una (el debounce solo
    // demoraría cuándo se procesa la respuesta, no cuántos requests salen).
    const delay = trimmed ? SEARCH_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      const load = trimmed ? searchGiphy(token, mode, trimmed) : getTrendingGiphy(token, mode);
      load
        .then((data) => {
          if (requestIdRef.current !== requestId) return; // respuesta vieja, ya no aplica
          setResults(data);
          setStatus("ready");
        })
        .catch((error) => {
          if (requestIdRef.current !== requestId) return;
          // El 403 (feature apagada) y el 503 (sin GIPHY_API_KEY, ver
          // backend/src/modules/giphy/README.md) ya traen un mensaje
          // entendible del backend — mostrarlo tal cual ahorra ir a la
          // consola del navegador para entender por qué no carga.
          setErrorMessage(error instanceof ApiError ? error.message : null);
          setStatus("error");
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [token, mode, query]);

  return (
    <div className="flex h-80 w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-black/5 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <div className="flex shrink-0 gap-1 border-b border-black/5 px-2 pt-2 dark:border-white/10">
        {TABS.filter((tab) => tab.mode === "emojis" || showGifsAndStickers).map((tab) => (
          <button
            key={tab.mode}
            type="button"
            onClick={() => setMode(tab.mode)}
            aria-current={tab.mode === mode}
            className={`rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab.mode === mode
                ? "border-b-2 border-brand-blue text-brand-blue dark:text-brand-blue-light"
                : "text-neutral-500 hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {mode === "emojis" ? (
        <EmojiPicker onSelect={onSelectEmoji} />
      ) : (
        <>
          <div className="shrink-0 px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded-md border border-black/10 px-2 py-1 dark:border-white/10">
              <IconSearch size={14} stroke={1.75} className="shrink-0 text-neutral-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === "gifs" ? "Buscar GIFs" : "Buscar stickers"}
                className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:text-white"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
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
                {results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onSelectGifSticker(mode, result.id, result.originalUrl)}
                    className="aspect-square overflow-hidden rounded-md bg-black/5 transition-opacity hover:opacity-80 disabled:opacity-40 dark:bg-white/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- previsualización animada de Giphy, no una imagen local optimizable por next/image */}
                    <img src={result.previewUrl} alt={result.title} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
