"use client";

import { useEffect } from "react";
import { IconLogout, IconShieldLock } from "@tabler/icons-react";
import { Logo } from "@/components/brand/Logo";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";
import type { MustChangePasswordReason } from "@/features/auth/types/auth.types";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useAuthConfig } from "@/providers/auth-config-provider";

const REASON_KEYS: Record<MustChangePasswordReason, string> = {
  reset: "password.reasonReset",
  expired: "password.reasonExpired",
  policy: "password.reasonPolicy",
};

/** Pantalla de cambio obligatorio de contraseña (docs/design/LOCAL_AUTH_PLAN.md,
 * D13). `AuthProvider` la muestra EN LUGAR de la app mientras la sesión tenga
 * un token restringido: así ni el socket, ni las llamadas, ni la foto de
 * perfil se montan con un token que el backend rechazaría con 403. */
export function ForcedPasswordChange() {
  const { t } = useTranslation();
  const { session, completePasswordChange, logout } = useAuth();
  const { config, refresh } = useAuthConfig();

  // Por si un admin cambió la política después de que la app cargó.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reason = session?.user.mustChangePasswordReason;
  const policy = config?.mode === "local" ? config.passwordPolicy : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-blue-light/10 via-white to-brand-teal-light/10 px-4 dark:from-brand-blue-dark/20 dark:via-neutral-950 dark:to-brand-teal-dark/10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="full" iconClassName="h-10 w-auto" textClassName="text-2xl" />
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light">
              <IconShieldLock size={20} stroke={1.75} />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
                {t("password.forcedTitle")}
              </h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t(reason ? REASON_KEYS[reason] : "password.reasonDefault")}
              </p>
            </div>
          </div>

          <ChangePasswordForm
            policy={policy}
            currentPasswordLabel={reason === "reset" ? t("password.temporaryPassword") : t("password.currentPassword")}
            onChanged={({ token, exp }) => completePasswordChange(token, exp)}
          />

          <button
            type="button"
            onClick={logout}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-sm text-neutral-500 hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white"
          >
            <IconLogout size={16} stroke={1.75} />
            {t("auth.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
