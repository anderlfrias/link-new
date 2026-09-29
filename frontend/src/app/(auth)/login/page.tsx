"use client";

import { Logo } from "@/components/brand/Logo";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { LanguageSelector } from "@/components/ui/LanguageSelector";
import { useTranslation } from "@/i18n";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-sm px-4">
      <div className="mb-4 flex justify-end">
        <LanguageSelector variant="compact" />
      </div>
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Logo variant="full" iconClassName="h-12 w-auto" textClassName="text-3xl" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t("auth.subtitle")}
        </p>
      </div>
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <LoginForm />
      </div>
    </div>
  );
}
