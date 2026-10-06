"use client";

import { FormEvent, useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import type { CreateAdminUserPayload } from "@/features/admin/types/admin-users.types";
import { useTranslation } from "@/i18n";

/** Mismo formato que valida el backend (LOCAL_AUTH_PLAN.md, D11): 3 a 32
 * caracteres `a-z 0-9 . _`, sin "@". Se guarda en minúsculas. */
const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AdminUserFormValues {
  name: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

interface AdminUserFormModalProps {
  mode: "create" | "edit";
  initialValues?: AdminUserFormValues;
  /** No se puede quitar el rol de admin a uno mismo: el backend lo rechaza. */
  disableAdminToggle?: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (payload: CreateAdminUserPayload) => void;
  onClose: () => void;
}

const EMPTY: AdminUserFormValues = { name: "", email: "", username: "", isAdmin: false };

/** Alta y edición de una cuenta local. La contraseña no se elige acá: al crear
 * la cuenta se genera una temporal, que se muestra una sola vez. */
export function AdminUserFormModal({
  mode,
  initialValues = EMPTY,
  disableAdminToggle = false,
  pending,
  error,
  onSubmit,
  onClose,
}: AdminUserFormModalProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AdminUserFormValues>(initialValues);

  const username = values.username.trim().toLowerCase();
  const email = values.email.trim().toLowerCase();
  const usernameError = username && !USERNAME_PATTERN.test(username) ? t("admin.users.usernameFormat") : undefined;
  const emailError = email && !EMAIL_PATTERN.test(email) ? t("admin.users.emailFormat") : undefined;
  const canSubmit = values.name.trim().length > 0 && email.length > 0 && !usernameError && !emailError && !pending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: values.name.trim(),
      email,
      // Vacío = sin username. En la edición, `null` se lo quita.
      username: username || null,
      roles: values.isAdmin ? [ADMIN_ROLE] : [],
    });
  }

  const title = mode === "create" ? t("admin.users.createTitle") : t("admin.users.editTitle");

  return (
    <Modal onClose={onClose} aria-label={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-5">
        <h3 className="font-display text-lg font-semibold text-brand-ink dark:text-white">{title}</h3>
        <Input
          aria-label={t("admin.users.fieldName")}
          placeholder={t("admin.users.fieldName")}
          value={values.name}
          maxLength={120}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
          required
        />
        <Input
          type="email"
          aria-label={t("admin.users.fieldEmail")}
          placeholder={t("admin.users.fieldEmail")}
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
          error={emailError}
          required
        />
        <Input
          aria-label={t("admin.users.fieldUsername")}
          placeholder={t("admin.users.fieldUsername")}
          value={values.username}
          onChange={(event) => setValues({ ...values, username: event.target.value })}
          error={usernameError}
        />
        <p className="-mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t("admin.users.usernameHint")}</p>
        <Checkbox
          checked={values.isAdmin}
          disabled={disableAdminToggle}
          onChange={(event) => setValues({ ...values, isAdmin: event.target.checked })}
          label={t("admin.users.fieldAdmin")}
        />
        {mode === "create" && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("admin.users.createPasswordHint")}</p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {pending && <IconLoader2 size={16} className="animate-spin" />}
            {mode === "create" ? t("admin.users.createSubmit") : t("common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
