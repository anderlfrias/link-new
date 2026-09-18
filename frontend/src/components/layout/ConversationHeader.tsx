import Link from "next/link";
import { IconChevronLeft, IconSearch } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import type { ReactNode } from "react";

interface ConversationHeaderProps {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  icon?: ReactNode;
  onOpenDetails?: () => void;
  onToggleSearch?: () => void;
  isSearchOpen?: boolean;
}

export function ConversationHeader({
  title,
  subtitle,
  imageUrl,
  icon,
  onOpenDetails,
  onToggleSearch,
  isSearchOpen = false,
}: ConversationHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-3 py-2.5 dark:border-white/10">
      <Link
        href="/"
        aria-label="Volver a la lista de conversaciones"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 lg:hidden dark:text-white dark:hover:bg-white/10"
      >
        <IconChevronLeft size={22} stroke={1.75} />
      </Link>
      <button
        type="button"
        onClick={onOpenDetails}
        disabled={!onOpenDetails}
        aria-label={`Ver información de ${title}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left disabled:cursor-default"
      >
        <Avatar name={title} imageUrl={imageUrl} icon={icon} />
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-ink dark:text-white">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
      </button>
      {onToggleSearch && (
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label="Buscar en el chat"
          title="Buscar en el chat (Ctrl+F)"
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            isSearchOpen
              ? "bg-brand-blue/15 text-brand-blue dark:bg-brand-blue/25 dark:text-brand-blue-light"
              : "text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          }`}
        >
          <IconSearch size={20} stroke={1.8} />
        </button>
      )}
    </div>
  );
}
