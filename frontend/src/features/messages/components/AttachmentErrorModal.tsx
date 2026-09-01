"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AttachmentFailureReason } from "@/features/messages/hooks/use-message-attachments";

interface AttachmentErrorModalProps {
  fileName: string;
  reason: AttachmentFailureReason;
  /** `AppSettings.maxUploadSizeMb` (ver PublicAppSettingsDTO) — si todavía no cargó, el mensaje
   * de tamaño queda sin el número exacto en vez de bloquearse esperándolo. */
  maxUploadSizeMb?: number;
  onAccept: () => void;
}

/** Explica por qué un adjunto quedó en rojo en el compositor — solo para los dos motivos de
 * rechazo que son configuración del admin (tipo de archivo, tamaño), ver `classifyUploadError`
 * en `use-message-attachments.ts`. El archivo sigue seleccionado después de "Aceptar": este
 * modal es una aclaración, no un descarte automático — el usuario decide si lo saca o no. */
export function AttachmentErrorModal({ fileName, reason, maxUploadSizeMb, onAccept }: AttachmentErrorModalProps) {
  const title = reason.kind === "size-limit" ? "Archivo demasiado grande" : "Tipo de archivo no permitido";
  const description =
    reason.kind === "size-limit"
      ? `"${fileName}" no se pudo adjuntar: supera el tamaño máximo permitido para archivos en este chat${
          maxUploadSizeMb ? ` (${maxUploadSizeMb} MB)` : ""
        }.`
      : `"${fileName}" no se pudo adjuntar: el tipo de archivo (${reason.mimeType}) no está permitido en esta conversación.`;

  return (
    <Modal onClose={onAccept} aria-label={title}>
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="mb-2 text-base font-semibold text-brand-ink dark:text-white">{title}</h3>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{description}</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          El archivo sigue en tu selección — quitalo o reemplazalo antes de enviar el mensaje.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-black/5 px-4 py-3 dark:border-white/10">
        <Button type="button" onClick={onAccept}>
          Aceptar
        </Button>
      </div>
    </Modal>
  );
}
