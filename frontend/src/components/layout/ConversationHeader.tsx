import Link from "next/link";
import { IconChevronLeft, IconPhone, IconSearch, IconVideo } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/i18n";
import type { ReactNode } from "react";

interface ConversationHeaderProps {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  icon?: ReactNode;
  onOpenDetails?: () => void;
  onToggleSearch?: () => void;
  isSearchOpen?: boolean;
  onStartAudioCall?: () => void;
  onStartVideoCall?: () => void;
}

export function ConversationHeader({
  title,
  subtitle,
  imageUrl,
  icon,
  onOpenDetails,
  onToggleSearch,
  isSearchOpen = false,
  onStartAudioCall,
  onStartVideoCall,
}: ConversationHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-3 py-2.5 dark:border-white/10">
      <Link
        href="/"
        aria-label={t("chat.backToList")}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 lg:hidden dark:text-white dark:hover:bg-white/10"
      >
        <IconChevronLeft size={22} stroke={1.75} />
      </Link>
      <button
        type="button"
        onClick={onOpenDetails}
        disabled={!onOpenDetails}
        aria-label={t("chat.viewInfoOf", { name: title })}
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
      {onStartAudioCall && (
        <button
          type="button"
          onClick={onStartAudioCall}
          aria-label={t("calls.audioCallBadge")}
          title={t("calls.audioCallBadge")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
        >
          <IconPhone size={20} stroke={1.8} />
        </button>
      )}
      {onStartVideoCall && (
        <button
          type="button"
          onClick={onStartVideoCall}
          aria-label={t("calls.videoCallBadge")}
          title={t("calls.videoCallBadge")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
        >
          <IconVideo size={20} stroke={1.8} />
        </button>
      )}
      {onToggleSearch && (
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label={t("chat.searchInChat")}
          title={t("chat.searchInChatShortcut")}
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
