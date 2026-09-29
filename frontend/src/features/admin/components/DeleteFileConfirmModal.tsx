"use client";

import { IconAlertCircle, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { buildUsageLabels } from "@/features/admin/utils/build-usage-labels";
import { useTranslation } from "@/i18n";
import type { AdminFileListItem } from "@/features/admin/types/admin-files.types";

interface DeleteFileConfirmModalProps {
  file: AdminFileListItem;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFileConfirmModal({ file, pending, error, onConfirm, onCancel }: DeleteFileConfirmModalProps) {
  const { t } = useTranslation();

  const usageLabels = buildUsageLabels(file.usage, {
    avatarSingle: t("admin.files.avatarSingle"),
    avatarMultiple: (count) => t("admin.files.avatarMultiple", { count }),
    groupImageSingle: t("admin.files.groupImageSingle"),
    groupImageMultiple: (count) => t("admin.files.groupImageMultiple", { count }),
    attachmentSingle: t("admin.files.attachmentSingle"),
    attachmentMultiple: (count) => t("admin.files.attachmentMultiple", { count }),
  });

  return (
    <Modal onClose={onCancel} aria-label={t("admin.files.deleteModalTitle")}>
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-2 text-base font-semibold text-brand-ink dark:text-white">
          {t("admin.files.deleteModalTitle")}
        </h3>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
          {t("admin.files.deleteModalDesc", { name: "" }).trim()}{" "}
          <span className="break-all font-medium">{file.originalName}</span>
        </p>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {t("admin.files.deleteModalWarning")}
          </span>
        </div>
        {usageLabels.length > 0 && (
          <div className="mb-3 rounded-lg bg-black/5 px-3 py-2 text-sm text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
            <p className="mb-1 font-medium">{t("admin.files.deleteModalInUse")}</p>
            <ul className="list-inside list-disc space-y-0.5">
              {usageLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
          {pending && <IconLoader2 className="animate-spin" size={16} />}
          {t("admin.files.deleteConfirmButton")}
        </Button>
      </div>
    </Modal>
  );
}
