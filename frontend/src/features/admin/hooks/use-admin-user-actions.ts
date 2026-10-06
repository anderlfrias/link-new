"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import {
  createAdminUser,
  resetAdminUserPassword,
  unlockAdminUser,
  updateAdminUser,
} from "@/features/admin/api/admin-users.api";
import type {
  AdminAccountView,
  CreateAdminUserPayload,
  CreateAdminUserResponse,
  ResetPasswordResponse,
  UpdateAdminUserPayload,
} from "@/features/admin/types/admin-users.types";
import { useTranslation } from "@/i18n";
import { ApiError } from "@/types/api.types";

/** Códigos de rechazo del backend que el panel traduce (backend/API.md §14). */
const ERROR_KEYS: Record<string, string> = {
  cannot_modify_self: "admin.users.errorCannotModifySelf",
  last_admin: "admin.users.errorLastAdmin",
  email_taken: "admin.users.errorEmailTaken",
  username_taken: "admin.users.errorUsernameTaken",
};

/** Acciones de administración de cuentas. Cada una devuelve el resultado, o
 * `null` si falló (el mensaje queda en `error`). Las contraseñas temporales
 * solo viajan en el valor devuelto: este hook no las guarda en ningún estado. */
export function useAdminUserActions() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.token;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(action: (token: string) => Promise<T>): Promise<T | null> => {
      if (!token) return null;
      setPending(true);
      setError(null);
      try {
        return await action(token);
      } catch (err) {
        if (err instanceof ApiError && err.code && ERROR_KEYS[err.code]) {
          setError(t(ERROR_KEYS[err.code]));
        } else {
          setError(err instanceof Error ? err.message : t("admin.users.errorDefault"));
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [token, t],
  );

  const update = useCallback(
    (id: string, payload: UpdateAdminUserPayload): Promise<AdminAccountView | null> =>
      run((tok) => updateAdminUser(tok, id, payload)),
    [run],
  );

  const create = useCallback(
    (payload: CreateAdminUserPayload): Promise<CreateAdminUserResponse | null> =>
      run((tok) => createAdminUser(tok, payload)),
    [run],
  );

  const resetPassword = useCallback(
    (id: string): Promise<ResetPasswordResponse | null> => run((tok) => resetAdminUserPassword(tok, id)),
    [run],
  );

  const unlock = useCallback(
    async (id: string): Promise<boolean> => (await run((tok) => unlockAdminUser(tok, id).then(() => true))) ?? false,
    [run],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, clearError, update, create, resetPassword, unlock };
}
