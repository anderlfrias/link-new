"use client";

import { FormEvent, useState } from "react";
import { IconAlertCircle, IconEye, IconEyeOff, IconLoader2, IconLock } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { changePassword } from "@/features/auth/api/auth.api";
import { PasswordRulesList } from "@/features/auth/components/PasswordRulesList";
import type { ChangePasswordResponse, PasswordPolicy } from "@/features/auth/types/auth.types";
import { failedPasswordRules } from "@/features/auth/utils/password-rules";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api.types";

interface ChangePasswordFormProps {
  /** `null` si no se pudo leer la política: el backend valida igual. */
  policy: PasswordPolicy | null;
  /** "Contraseña actual" o, en el cambio obligatorio, "Contraseña temporal". */
  currentPasswordLabel: string;
  /** Recibe el token nuevo, que reemplaza al actual. */
  onChanged: (response: ChangePasswordResponse) => void;
}

/** Formulario de cambio de la propia contraseña (modo local). Lo usan la
 * pantalla de cambio obligatorio y la sección "Seguridad" del perfil. Los
 * rechazos del backend son 400 con `code`, nunca 401: un error acá nunca
 * cierra la sesión. */
export function ChangePasswordForm({ policy, currentPasswordLabel, onChanged }: ChangePasswordFormProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetsPolicy = !policy || failedPasswordRules(newPassword, policy).length === 0;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    currentPassword.length > 0 && newPassword.length > 0 && newPassword === confirmPassword && meetsPolicy && !submitting;

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      switch (err.code) {
        case "invalid_current_password":
          return t("password.errorInvalidCurrent");
        case "password_policy":
          return t("password.errorPolicy");
        case "password_reused":
          return policy && policy.historyCount > 1
            ? t("password.ruleHistory", { count: policy.historyCount })
            : t("password.ruleNotCurrent");
        default:
          return err.message;
      }
    }
    return t("password.errorDefault");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await changePassword(session.token, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const type = showPasswords ? "text" : "password";
  const toggle = (
    <button
      type="button"
      onClick={() => setShowPasswords((prev) => !prev)}
      className="text-neutral-400 hover:text-brand-ink dark:hover:text-white"
      aria-label={showPasswords ? t("auth.hidePassword") : t("auth.showPassword")}
    >
      {showPasswords ? <IconEyeOff size={18} stroke={1.75} /> : <IconEye size={18} stroke={1.75} />}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <Input
        type={type}
        aria-label={currentPasswordLabel}
        placeholder={currentPasswordLabel}
        autoComplete="current-password"
        icon={<IconLock size={18} stroke={1.75} />}
        rightElement={toggle}
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <Input
        type={type}
        aria-label={t("password.newPassword")}
        placeholder={t("password.newPassword")}
        autoComplete="new-password"
        icon={<IconLock size={18} stroke={1.75} />}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      <Input
        type={type}
        aria-label={t("password.confirmPassword")}
        placeholder={t("password.confirmPassword")}
        autoComplete="new-password"
        icon={<IconLock size={18} stroke={1.75} />}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={mismatch ? t("password.mismatch") : undefined}
        required
      />

      {policy && <PasswordRulesList policy={policy} password={newPassword} />}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400"
        >
          <IconAlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} className="mt-1 w-full">
        {submitting && <IconLoader2 size={18} className="animate-spin" />}
        {submitting ? t("password.submitting") : t("password.submit")}
      </Button>
    </form>
  );
}
