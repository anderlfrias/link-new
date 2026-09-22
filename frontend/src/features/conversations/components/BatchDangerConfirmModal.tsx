"use client";

import { useMemo } from "react";
import { IconAlertCircle, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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
  const count = selectedConversations.length;

  const { title, description, confirmLabel } = useMemo(() => {
    if (kind === "leave") {
      const isSingle = count === 1;
      return {
        title: isSingle ? "Salir del grupo" : `¿Salir de ${count} grupos?`,
        description: isSingle
          ? "Dejarás de ser miembro de este grupo y no podrás ver los mensajes nuevos."
          : `Dejarás de ser miembro de estos ${count} grupos y no podrás ver los mensajes nuevos.`,
        confirmLabel: isSingle ? "Salir del grupo" : `Salir de ${count} grupos`,
      };
    }

    // kind === "delete"
    const privateCount = selectedConversations.filter((c) => c.type !== "GROUP").length;
    const groupCount = selectedConversations.filter((c) => c.type === "GROUP").length;

    if (groupCount === 0) {
      const isSingle = privateCount === 1;
      return {
        title: isSingle ? "Eliminar chat" : `¿Eliminar ${privateCount} chats?`,
        description: isSingle
          ? "Se eliminará esta conversación de tu lista. Si te escriben de nuevo o le escribes a la persona, reaparecerá."
          : `Se eliminarán estas ${privateCount} conversaciones de tu lista. Si te escriben de nuevo, volverán a aparecer.`,
        confirmLabel: isSingle ? "Eliminar chat" : `Eliminar ${privateCount} chats`,
      };
    }

    if (privateCount === 0) {
      const isSingle = groupCount === 1;
      return {
        title: isSingle ? "Eliminar grupo" : `¿Eliminar ${groupCount} grupos?`,
        description: isSingle
          ? "Esta acción no se puede deshacer. El grupo se eliminará definitivamente para todos los integrantes."
          : `Esta acción no se puede deshacer. Los ${groupCount} grupos se eliminarán definitivamente para todos los integrantes.`,
        confirmLabel: isSingle ? "Eliminar grupo" : `Eliminar ${groupCount} grupos`,
      };
    }

    return {
      title: `¿Eliminar ${count} conversaciones?`,
      description: `Se eliminarán ${privateCount} chat${privateCount > 1 ? "s" : ""} de tu lista y ${groupCount} grupo${groupCount > 1 ? "s" : ""} de forma definitiva para todos los integrantes.`,
      confirmLabel: `Eliminar ${count} conversaciones`,
    };
  }, [kind, count, selectedConversations]);

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
          Cancelar
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
          {pending && <IconLoader2 className="animate-spin" size={16} />}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
