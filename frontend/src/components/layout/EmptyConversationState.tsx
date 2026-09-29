"use client";

import { Logo } from "@/components/brand/Logo";
import { useTranslation } from "@/i18n";

export function EmptyConversationState() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center dark:bg-white/2">
      <Logo variant="icon" iconClassName="h-20 w-auto opacity-90" />
      <div>
        <p className="font-display text-xl font-semibold text-brand-ink dark:text-white">Link</p>
        <p className="mt-1 max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
          {t("chat.emptySelectPrompt")}
        </p>
      </div>
    </div>
  );
}
