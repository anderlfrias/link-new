"use client";

import { useEffect, useRef } from "react";
import { IconChevronDown, IconChevronUp, IconLoader2, IconSearch, IconX } from "@tabler/icons-react";

interface InChatSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchCount: number;
  activeMatchIndex: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

export function InChatSearchBar({
  searchQuery,
  onSearchChange,
  matchCount,
  activeMatchIndex,
  onPrevMatch,
  onNextMatch,
  onClose,
  isLoading = false,
}: InChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div
      role="search"
      aria-label="Búsqueda en la conversación"
      className="flex items-center gap-2 border-b border-black/5 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-md transition-all duration-200 dark:border-white/10 dark:bg-neutral-900/95"
    >
      <div className="relative flex min-w-0 flex-1 items-center">
        <IconSearch
          size={18}
          className="pointer-events-none absolute left-3 text-neutral-400 dark:text-neutral-500"
          stroke={1.8}
        />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en la conversación..."
          aria-label="Buscar en la conversación"
          className="h-9 w-full rounded-lg bg-neutral-100/90 pl-9 pr-8 text-sm text-brand-ink placeholder-neutral-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30 dark:bg-neutral-800/90 dark:text-white dark:placeholder-neutral-500 dark:focus:bg-neutral-800 dark:focus:ring-brand-blue/40"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            title="Limpiar búsqueda"
            className="absolute right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-black/10 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconX size={14} stroke={2} />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isLoading ? (
          <div className="flex items-center px-1 text-brand-blue dark:text-brand-blue-light" title="Buscando...">
            <IconLoader2 size={16} className="animate-spin" />
          </div>
        ) : hasQuery ? (
          <span
            aria-live="polite"
            className={`px-1.5 text-xs font-medium ${
              matchCount > 0
                ? "text-neutral-500 dark:text-neutral-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {matchCount > 0 ? `${activeMatchIndex} de ${matchCount}` : "Sin resultados"}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onPrevMatch}
          disabled={matchCount === 0}
          aria-label="Coincidencia anterior"
          title="Coincidencia anterior (Shift+Enter)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <IconChevronUp size={18} stroke={2} />
        </button>

        <button
          type="button"
          onClick={onNextMatch}
          disabled={matchCount === 0}
          aria-label="Siguiente coincidencia"
          title="Siguiente coincidencia (Enter)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <IconChevronDown size={18} stroke={2} />
        </button>

        <div className="mx-0.5 h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar búsqueda"
          title="Cerrar búsqueda (Esc)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={18} stroke={1.8} />
        </button>
      </div>
    </div>
  );
}
