"use client";

import { useTranslation } from "@/i18n";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/types";
import { cn } from "@/utils/cn";

interface LanguageSelectorProps {
  variant?: "segmented" | "compact";
  className?: string;
  onLanguageChange?: (locale: Locale) => void;
  disabled?: boolean;
}

export function LanguageSelector({
  variant = "segmented",
  className,
  onLanguageChange,
  disabled = false,
}: LanguageSelectorProps) {
  const { locale, setLocale, t } = useTranslation();

  const handleSelect = (nextLocale: Locale) => {
    if (disabled || nextLocale === locale) return;
    setLocale(nextLocale);
    onLanguageChange?.(nextLocale);
  };

  if (variant === "compact") {
    return (
      <div
        className={cn("inline-flex items-center gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10", className)}
        role="group"
        aria-label={t("profile.language")}
      >
        {SUPPORTED_LOCALES.map((item) => {
          const isActive = locale === item.code;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => handleSelect(item.code)}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={item.label}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-white text-brand-ink shadow-xs dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <span className="text-sm leading-none">{item.flag}</span>
              <span>{item.code.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-1.5 dark:border-white/10 dark:bg-white/[0.02]",
        className,
      )}
      role="radiogroup"
      aria-label={t("profile.language")}
    >
      {SUPPORTED_LOCALES.map((item) => {
        const isActive = locale === item.code;
        return (
          <button
            key={item.code}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => handleSelect(item.code)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-sm font-medium transition-all duration-150",
              isActive
                ? "bg-white text-brand-blue shadow-xs border border-brand-blue/20 dark:bg-neutral-800 dark:text-brand-blue-light dark:border-brand-blue/30"
                : "text-neutral-600 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-300 dark:hover:bg-white/5 dark:hover:text-white",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className="text-base leading-none">{item.flag}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
