"use client";

import { useState, type FormEvent } from "react";
import { IconAlertCircle, IconInfoCircle, IconLoader2, IconUserPlus } from "@tabler/icons-react";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { useAdminUserActions } from "@/features/admin/hooks/use-admin-user-actions";
import { AdminUserRow } from "@/features/admin/components/AdminUserRow";
import { AdminUserFormModal, type AdminUserFormValues } from "@/features/admin/components/AdminUserFormModal";
import { TemporaryPasswordModal } from "@/features/admin/components/TemporaryPasswordModal";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import type { AdminUserFilters, AdminUserListItem, AdminUserStatus } from "@/features/admin/types/admin-users.types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/auth-provider";
import { useTranslation } from "@/i18n";

type FormState = { mode: "create" } | { mode: "edit"; user: AdminUserListItem } | null;

/** Contraseña temporal recién generada: solo en el estado de este panel y solo
 * hasta que se cierra el modal (LOCAL_AUTH_PLAN.md §7). */
type TemporaryPassword = { account: string; password: string } | null;

export function AdminUsersPanel() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Modo de la instalación según la sesión del propio admin (ausente = external-auth).
  const mode = session?.user.authProvider === "local" ? "local" : "external-auth";
  const local = mode === "local";

  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<AdminUserStatus | "">("");
  const [withoutPasswordDraft, setWithoutPasswordDraft] = useState(false);
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const { users, status, error, hasMore, loadingMore, loadMore, totalCount, refetch } = useAdminUsers(filters);
  const actions = useAdminUserActions();
  const [form, setForm] = useState<FormState>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPassword>(null);

  function handleApplyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({
      search: searchDraft.trim() || undefined,
      status: statusDraft || undefined,
      hasPassword: local && withoutPasswordDraft ? false : undefined,
    });
  }

  function handleClearFilters() {
    setSearchDraft("");
    setStatusDraft("");
    setWithoutPasswordDraft(false);
    setFilters({});
  }

  async function handleSetStatus(user: AdminUserListItem, nextStatus: AdminUserStatus) {
    if (await actions.update(user.id, { status: nextStatus })) refetch();
  }

  async function handleResetPassword(user: AdminUserListItem) {
    const result = await actions.resetPassword(user.id);
    if (result?.temporaryPassword) {
      setTemporaryPassword({ account: user.email, password: result.temporaryPassword });
    }
    if (result) refetch();
  }

  async function handleUnlock(user: AdminUserListItem) {
    if (await actions.unlock(user.id)) refetch();
  }

  async function handleSubmitForm(payload: Parameters<typeof actions.create>[0]) {
    if (!form) return;
    if (form.mode === "create") {
      const result = await actions.create(payload);
      if (!result) return;
      setForm(null);
      if (result.temporaryPassword) {
        setTemporaryPassword({ account: result.user.email, password: result.temporaryPassword });
      }
    } else {
      const result = await actions.update(form.user.id, payload);
      if (!result) return;
      setForm(null);
    }
    refetch();
  }

  function formValues(user: AdminUserListItem): AdminUserFormValues {
    return {
      name: user.name,
      email: user.email,
      username: user.username ?? "",
      isAdmin: user.localRoles?.includes(ADMIN_ROLE) ?? false,
    };
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">{t("admin.users.title")}</h2>
            {local && (
              <Button
                type="button"
                onClick={() => {
                  actions.clearError();
                  setForm({ mode: "create" });
                }}
              >
                <IconUserPlus size={16} stroke={1.75} />
                {t("admin.users.createButton")}
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-brand-blue/10 px-3 py-2 text-sm text-brand-blue dark:bg-brand-blue/20">
            <IconInfoCircle size={16} className="mt-0.5 shrink-0" />
            <span>{local ? t("admin.users.localNotice") : t("admin.users.external-authNotice")}</span>
          </div>

          <form onSubmit={handleApplyFilters} className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={t("admin.users.searchPlaceholder")}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="max-w-sm"
            />
            <select
              aria-label={t("admin.users.statusFilter")}
              value={statusDraft}
              onChange={(event) => setStatusDraft(event.target.value as AdminUserStatus | "")}
              className="rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-brand-ink dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">{t("admin.users.statusAll")}</option>
              <option value="ACTIVE">{t("admin.users.statusActive")}</option>
              <option value="INACTIVE">{t("admin.users.statusInactive")}</option>
            </select>
            {local && (
              <Checkbox
                checked={withoutPasswordDraft}
                onChange={(event) => setWithoutPasswordDraft(event.target.checked)}
                label={t("admin.users.withoutPasswordFilter")}
              />
            )}
            <Button type="submit">{t("admin.users.search")}</Button>
            <Button type="button" variant="ghost" onClick={handleClearFilters}>
              {t("admin.users.clear")}
            </Button>
          </form>

          {actions.error && !form && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{actions.error}</span>
            </div>
          )}

          {status !== "error" && (status !== "loading" || users.length > 0) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("admin.users.count", { count: totalCount })}
            </p>
          )}

          {(status === "loading" || status === "idle") && users.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <IconLoader2 className="animate-spin text-brand-blue" size={28} />
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
              <Button type="button" variant="ghost" onClick={refetch}>
                {t("admin.users.retry")}
              </Button>
            </div>
          )}

          {status === "ready" && users.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {t("admin.users.empty")}
            </p>
          )}

          {users.length > 0 && (
            <div className="flex flex-col">
              {users.map((user) => (
                <AdminUserRow
                  key={user.id}
                  user={user}
                  mode={mode}
                  isSelf={user.id === session?.user.internalUserId}
                  pending={actions.pending}
                  onSetStatus={handleSetStatus}
                  onEdit={
                    local
                      ? (target) => {
                          actions.clearError();
                          setForm({ mode: "edit", user: target });
                        }
                      : undefined
                  }
                  onResetPassword={local ? handleResetPassword : undefined}
                  onUnlock={local ? handleUnlock : undefined}
                />
              ))}
            </div>
          )}

          {hasMore && users.length > 0 && (
            <div className="flex justify-center py-3">
              <Button type="button" variant="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <IconLoader2 className="animate-spin" size={16} />}
                {t("admin.users.loadMore")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {form && (
        <AdminUserFormModal
          mode={form.mode}
          initialValues={form.mode === "edit" ? formValues(form.user) : undefined}
          disableAdminToggle={form.mode === "edit" && form.user.id === session?.user.internalUserId}
          pending={actions.pending}
          error={actions.error}
          onSubmit={handleSubmitForm}
          onClose={() => setForm(null)}
        />
      )}

      {temporaryPassword && (
        <TemporaryPasswordModal
          accountLabel={temporaryPassword.account}
          password={temporaryPassword.password}
          onClose={() => setTemporaryPassword(null)}
        />
      )}
    </div>
  );
}
