"use client";

import { IconTrash } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { formatFileSize } from "@/utils/file-format";
import { buildUsageLabels } from "@/features/admin/utils/build-usage-labels";
import { useTranslation } from "@/i18n";
import type { AdminFileListItem } from "@/features/admin/types/admin-files.types";

interface AdminFileRowProps {
  file: AdminFileListItem;
  onDelete: (file: AdminFileListItem) => void;
}

export function AdminFileRow({ file, onDelete }: AdminFileRowProps) {
  const { t, locale } = useTranslation();

  const usageLabels = buildUsageLabels(file.usage, {
    avatarSingle: t("admin.files.avatarSingle"),
    avatarMultiple: (count) => t("admin.files.avatarMultiple", { count }),
    groupImageSingle: t("admin.files.groupImageSingle"),
    groupImageMultiple: (count) => t("admin.files.groupImageMultiple", { count }),
    attachmentSingle: t("admin.files.attachmentSingle"),
    attachmentMultiple: (count) => t("admin.files.attachmentMultiple", { count }),
  });

  const uploaderLabel = file.createdBy
    ? `${file.createdBy.name} · ${file.createdBy.email}`
    : t("admin.files.deletedUser");

  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-1 py-2.5 last:border-0 dark:border-white/10">
      <FileTypeIcon mimeType={file.mimeType} size={22} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-brand-ink dark:text-white">{file.originalName}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {formatFileSize(file.size)} · {uploaderLabel} ·{" "}
          {new Date(file.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "es-AR")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {file.provider && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              file.provider === "S3"
                ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
            }`}
          >
            {file.provider === "S3" ? "S3" : t("admin.files.localProvider")}
          </span>
        )}
        {usageLabels.length === 0 ? (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
            {t("admin.files.noUsage")}
          </span>
        ) : (
          usageLabels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] text-brand-blue dark:bg-brand-blue/20"
            >
              {label}
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(file)}
        aria-label={t("admin.files.deleteAria", { name: file.originalName })}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:text-neutral-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
      >
        <IconTrash size={16} />
      </button>
    </div>
  );
}
