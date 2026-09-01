"use client";

import { IconAlertCircle, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface DeleteMessageConfirmModalProps {
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteMessageConfirmModal({ pending, error, onConfirm, onCancel }: DeleteMessageConfirmModalProps) {
  return (
    <Modal onClose={onCancel} aria-label="Eliminar mensaje para todos">
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-2 text-base font-semibold text-brand-ink dark:text-white">Eliminar mensaje para todos</h3>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            El resto de la conversación va a ver &quot;Mensaje eliminado&quot; en su lugar. Esta acción no se puede
            deshacer.
          </span>
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
          Cancelar
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
          {pending && <IconLoader2 className="animate-spin" size={16} />}
          Eliminar para todos
        </Button>
      </div>
    </Modal>
  );
}
