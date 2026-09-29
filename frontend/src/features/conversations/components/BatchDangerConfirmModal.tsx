"use client";

import { useMemo } from "react";
import { IconAlertCircle, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

interface BatchDangerConfirmModalProps {
  kind: "delete" | "leave";
  selectedConversations: ConversationListItem[];
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BatchDangerConfirmModal({
  kind,
  selectedConversations,
  pending,
  error,
  onConfirm,
  onCancel,
}: BatchDangerConfirmModalProps) {
  const { t } = useTranslation();
  const count = selectedConversations.length;

  const { title, description, confirmLabel } = useMemo(() => {
    if (kind === "leave") {
      const isSingle = count === 1;
      return {
        title: isSingle
          ? t("modals.batchLeaveTitleSingle")
          : t("modals.batchLeaveTitleMultiple", { count }),
        description: isSingle
          ? t("modals.batchLeaveDescSingle")
          : t("modals.batchLeaveDescMultiple", { count }),
        confirmLabel: isSingle
          ? t("modals.batchLeaveConfirmSingle")
          : t("modals.batchLeaveConfirmMultiple", { count }),
      };
    }

    // kind === "delete"
    const privateCount = selectedConversations.filter((c) => c.type !== "GROUP").length;
    const groupCount = selectedConversations.filter((c) => c.type === "GROUP").length;

    if (groupCount === 0) {
      const isSingle = privateCount === 1;
      return {
        title: isSingle
          ? t("modals.batchDeletePrivateTitleSingle")
          : t("modals.batchDeletePrivateTitleMultiple", { count: privateCount }),
        description: isSingle
          ? t("modals.batchDeletePrivateDescSingle")
          : t("modals.batchDeletePrivateDescMultiple", { count: privateCount }),
        confirmLabel: isSingle
          ? t("modals.batchDeletePrivateConfirmSingle")
          : t("modals.batchDeletePrivateConfirmMultiple", { count: privateCount }),
      };
    }

    if (privateCount === 0) {
      const isSingle = groupCount === 1;
      return {
        title: isSingle
          ? t("modals.batchDeleteGroupTitleSingle")
          : t("modals.batchDeleteGroupTitleMultiple", { count: groupCount }),
        description: isSingle
          ? t("modals.batchDeleteGroupDescSingle")
          : t("modals.batchDeleteGroupDescMultiple", { count: groupCount }),
        confirmLabel: isSingle
          ? t("modals.batchDeleteGroupConfirmSingle")
          : t("modals.batchDeleteGroupConfirmMultiple", { count: groupCount }),
      };
    }

    return {
      title: t("modals.batchDeleteMixedTitle", { count }),
      description: t("modals.batchDeleteMixedDesc", { privateCount, groupCount }),
      confirmLabel: t("modals.batchDeleteMixedConfirm", { count }),
    };
  }, [kind, count, selectedConversations, t]);

  return (
    <Modal onClose={onCancel} aria-label={title}>
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-2 text-base font-semibold text-brand-ink dark:text-white">{title}</h3>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{description}</span>
        </div>
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
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
