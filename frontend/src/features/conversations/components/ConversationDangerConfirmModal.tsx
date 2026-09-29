"use client";

import { IconAlertCircle, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";

interface ConversationDangerConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación genérica para las 3 acciones destructivas de conversación (Eliminar chat,
 * Eliminar grupo, Salir del grupo) — mismo esqueleto que `DeleteMessageConfirmModal.tsx`, pero
 * parametrizado en vez de un componente por acción: las 3 comparten estructura al pie de la
 * letra, solo cambia el texto. */
export function ConversationDangerConfirmModal({
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: ConversationDangerConfirmModalProps) {
  const { t } = useTranslation();

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
