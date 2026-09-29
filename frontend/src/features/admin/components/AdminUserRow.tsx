"use client";

import { Avatar } from "@/components/ui/Avatar";
import { getAvatarUrl } from "@/utils/file-url";
import { formatFileSize } from "@/utils/file-format";
import { useTranslation } from "@/i18n";
import type { AdminUserListItem } from "@/features/admin/types/admin-users.types";

interface AdminUserRowProps {
  user: AdminUserListItem;
}

export function AdminUserRow({ user }: AdminUserRowProps) {
  const { t, locale } = useTranslation();

  const formattedDate = new Date(user.createdAt).toLocaleDateString(
    locale === "en" ? "en-US" : "es-AR",
  );

  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-1 py-2.5 last:border-0 dark:border-white/10">
      <Avatar
        name={user.name}
        imageUrl={getAvatarUrl(user)}
        size="md"
      />
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
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
          {t("admin.users.filesCount", {
            size: formatFileSize(user.storage.totalSize),
            count: user.storage.fileCount,
          })}
        </span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
          {t("admin.users.activityStats", {
            conversations: user.activity.conversationCount,
            messages: user.activity.messagesSentCount,
          })}
        </span>
        {user.activity.groupsAdministeredCount > 0 && (
          <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] text-brand-blue dark:bg-brand-blue/20">
            {t("admin.users.groupsAdminCount", {
              count: user.activity.groupsAdministeredCount,
            })}
          </span>
        )}
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
          {user.syncProfileWithIntegration ? t("admin.users.syncedWithProvider") : t("admin.users.editedLocally")}
        </span>
      </div>
    </div>
  );
}
