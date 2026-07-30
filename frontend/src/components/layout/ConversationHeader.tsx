import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";

interface ConversationHeaderProps {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  onOpenDetails?: () => void;
}

export function ConversationHeader({ title, subtitle, imageUrl, onOpenDetails }: ConversationHeaderProps) {
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
        <Avatar name={title} imageUrl={imageUrl} />
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-ink dark:text-white">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
      </button>
    </div>
  );
}
