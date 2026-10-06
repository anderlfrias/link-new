"use client";

import { useState } from "react";
import { IconKey, IconLockOpen, IconPencil, IconUserCheck, IconUserOff } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import type { AuthMode } from "@/features/auth/types/auth.types";
import { getAvatarUrl } from "@/utils/file-url";
import { formatFileSize } from "@/utils/file-format";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import type { AdminUserListItem } from "@/features/admin/types/admin-users.types";

interface AdminUserRowProps {
  user: AdminUserListItem;
  /** Modo de la instalación: en external-auth los datos de la cuenta los administra EXTERNAL_AUTH. */
  mode?: AuthMode;
  /** La propia cuenta: nadie puede desactivarse a sí mismo. */
  isSelf?: boolean;
  pending?: boolean;
  /** Sin handlers, la fila es de solo lectura. */
  onSetStatus?: (user: AdminUserListItem, status: AdminUserListItem["status"]) => void;
  onEdit?: (user: AdminUserListItem) => void;
  onResetPassword?: (user: AdminUserListItem) => void;
  onUnlock?: (user: AdminUserListItem) => void;
}

type PendingConfirmation = "deactivate" | "reset" | null;

const BADGE = "rounded-full px-2 py-0.5 text-[11px]";
const NEUTRAL = "bg-black/5 text-neutral-500 dark:bg-white/10 dark:text-neutral-400";

export function AdminUserRow({
  user,
  mode = "external-auth",
  isSelf = false,
  pending = false,
  onSetStatus,
  onEdit,
  onResetPassword,
  onUnlock,
}: AdminUserRowProps) {
  const { t, locale } = useTranslation();
  const [confirming, setConfirming] = useState<PendingConfirmation>(null);

  const formattedDate = new Date(user.createdAt).toLocaleDateString(
    locale === "en" ? "en-US" : "es-AR",
  );
  const active = user.status === "ACTIVE";
  const local = mode === "local";

  function confirm() {
    if (confirming === "deactivate") onSetStatus?.(user, "INACTIVE");
    if (confirming === "reset") onResetPassword?.(user);
    setConfirming(null);
  }

  const actionButton =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-black/5 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10";

  return (
    <div className="border-b border-black/5 px-1 py-2.5 last:border-0 dark:border-white/10">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} imageUrl={getAvatarUrl(user)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
            {user.name}
            {user.username && <span className="text-neutral-400 dark:text-neutral-500"> · @{user.username}</span>}
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {user.email} · {t("admin.users.since", { date: formattedDate })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span
            className={cn(
              BADGE,
              active
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
            )}
          >
            {active ? t("admin.users.statusActive") : t("admin.users.statusInactive")}
          </span>
          {local && user.localRoles?.includes(ADMIN_ROLE) && (
            <span className={cn(BADGE, "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20")}>
              {t("admin.users.badgeAdmin")}
            </span>
          )}
          {local && user.locked && (
            <span className={cn(BADGE, "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300")}>
              {t("admin.users.badgeLocked")}
            </span>
          )}
          {local && user.hasPassword === false && (
            <span className={cn(BADGE, NEUTRAL)}>{t("admin.users.badgeNoPassword")}</span>
          )}
          {local && user.hasPassword && user.mustChangePassword && (
            <span className={cn(BADGE, NEUTRAL)}>{t("admin.users.badgeMustChange")}</span>
          )}
          <span className={cn(BADGE, NEUTRAL)}>
            {t("admin.users.filesCount", {
              size: formatFileSize(user.storage.totalSize),
              count: user.storage.fileCount,
            })}
          </span>
          <span className={cn(BADGE, NEUTRAL)}>
            {t("admin.users.activityStats", {
              conversations: user.activity.conversationCount,
              messages: user.activity.messagesSentCount,
            })}
          </span>
          {user.activity.groupsAdministeredCount > 0 && (
            <span className={cn(BADGE, "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20")}>
              {t("admin.users.groupsAdminCount", {
                count: user.activity.groupsAdministeredCount,
              })}
            </span>
          )}
          {!local && (
            <span className={cn(BADGE, NEUTRAL)}>
              {user.syncProfileWithIntegration ? t("admin.users.syncedWithProvider") : t("admin.users.editedLocally")}
            </span>
          )}
        </div>
      </div>

      {(onSetStatus || onEdit || onResetPassword || onUnlock) && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          {confirming ? (
            <div className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1 text-xs dark:bg-white/5">
              <span className="text-neutral-600 dark:text-neutral-300">
                {confirming === "deactivate" ? t("admin.users.confirmDeactivate") : t("admin.users.confirmReset")}
              </span>
              <button type="button" className={actionButton} onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={cn(actionButton, "font-medium text-red-600 dark:text-red-400")}
                disabled={pending}
                onClick={confirm}
              >
                {t("common.confirm")}
              </button>
            </div>
          ) : (
            <>
              {local && onEdit && (
                <button type="button" className={actionButton} disabled={pending} onClick={() => onEdit(user)}>
                  <IconPencil size={14} stroke={1.75} />
                  {t("common.edit")}
                </button>
              )}
              {local && onResetPassword && (
                <button type="button" className={actionButton} disabled={pending} onClick={() => setConfirming("reset")}>
                  <IconKey size={14} stroke={1.75} />
                  {user.hasPassword ? t("admin.users.actionResetPassword") : t("admin.users.actionAssignPassword")}
                </button>
              )}
              {local && onUnlock && user.locked && (
                <button type="button" className={actionButton} disabled={pending} onClick={() => onUnlock(user)}>
                  <IconLockOpen size={14} stroke={1.75} />
                  {t("admin.users.actionUnlock")}
                </button>
              )}
              {onSetStatus && !isSelf && active && (
                <button
                  type="button"
                  className={actionButton}
                  disabled={pending}
                  onClick={() => setConfirming("deactivate")}
                >
                  <IconUserOff size={14} stroke={1.75} />
                  {t("admin.users.actionDeactivate")}
                </button>
              )}
              {onSetStatus && !active && (
                <button type="button" className={actionButton} disabled={pending} onClick={() => onSetStatus(user, "ACTIVE")}>
                  <IconUserCheck size={14} stroke={1.75} />
                  {t("admin.users.actionReactivate")}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
