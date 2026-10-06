"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
  IconUser,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/auth-provider";
import { useAuthConfig } from "@/providers/auth-config-provider";
import { useTranslation } from "@/i18n";
import { ApiError } from "@/types/api.types";

export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { config } = useAuthConfig();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ user, password });
      router.push("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("auth.defaultLoginError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <Input
        type="text"
        // EXTERNAL_AUTH también acepta el correo en este campo: misma etiqueta en los
        // dos modos (docs/design/LOCAL_AUTH_PLAN.md, D11).
        placeholder={t("auth.usernameOrEmail")}
        aria-label={t("auth.usernameOrEmail")}
        autoComplete="username"
        icon={<IconUser size={18} stroke={1.75} />}
        value={user}
        onChange={(event) => setUser(event.target.value)}
        required
      />
      <Input
        type={showPassword ? "text" : "password"}
        placeholder={t("auth.password")}
        aria-label={t("auth.password")}
        autoComplete="current-password"
        icon={<IconLock size={18} stroke={1.75} />}
        rightElement={
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="text-neutral-400 hover:text-brand-ink dark:hover:text-white"
            aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
          >
            {showPassword ? (
               <IconEyeOff size={18} stroke={1.75} />
            ) : (
              <IconEye size={18} stroke={1.75} />
            )}
          </button>
        }
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading && <IconLoader2 size={18} className="animate-spin" />}
        {loading ? t("auth.loggingIn") : t("auth.loginButton")}
      </Button>

      {/* En modo local no hay recuperación por email (no hay SMTP): la
          contraseña la restablece un admin. En modo external-auth eso lo maneja EXTERNAL_AUTH. */}
      {config?.mode === "local" && (
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">{t("auth.forgotPasswordLocal")}</p>
      )}
    </form>
  );
}
