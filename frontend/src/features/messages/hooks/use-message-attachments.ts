"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { compressImage, IMAGE_COMPRESSION_PRESETS } from "@/utils/compress-image";
import type { UploadedFile } from "@/features/files/types/file.types";

export type AttachmentStatus = "uploading" | "done" | "error";

export interface PendingAttachment {
  localId: string;
  file: File;
  status: AttachmentStatus;
  uploaded?: UploadedFile;
  error?: string;
}

/** Los dos rechazos de `uploadFile` (`file.service.ts`) que ameritan interrumpir al usuario con
 * un modal en vez de dejarlo solo en el chip — son configuración del admin (tipo de archivo,
 * tamaño máximo), no un error de red o del servidor, así que vale la pena explicarlos. */
export type AttachmentFailureReason = { kind: "unsupported-type"; mimeType: string } | { kind: "size-limit" };

export interface AttachmentValidationError {
  localId: string;
  fileName: string;
  reason: AttachmentFailureReason;
}

/// Mensajes que arma `file.service.ts#uploadFile` para estos dos casos —
/// únicos en todo el backend a esa función (ver grep), así que reconocerlos
/// acá por texto es seguro: no hay otro endpoint que produzca este formato.
/// MulterError (techo fijo de 500MB, `ABSOLUTE_MAX_UPLOAD_BYTES`) usa su
/// propio mensaje default de multer ("File too large") — se trata igual como
/// límite de tamaño, aunque ese techo no lo edita un admin.
function classifyUploadError(message: string): AttachmentFailureReason | null {
  const notAllowed = message.match(/^File type "(.+)" is not allowed$/);
  if (notAllowed) return { kind: "unsupported-type", mimeType: notAllowed[1] };

  const blocked = message.match(/^File type "(.+)" is blocked$/);
  if (blocked) return { kind: "unsupported-type", mimeType: blocked[1] };

  if (/^File exceeds the maximum allowed size of/.test(message) || /too large/i.test(message)) {
    return { kind: "size-limit" };
  }

  return null;
}

/**
 * Sube cada archivo apenas se elige (no recién al enviar) — igual que
 * WhatsApp Web/Telegram: el usuario ve progreso o error por adjunto antes de
 * tocar "enviar", en vez de que todo el envío falle recién al final.
 */
export function useMessageAttachments(conversationId: string) {
  const { session } = useAuth();
  const token = session?.token;
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Cola en vez de un solo valor: soltar varios archivos rechazados a la vez
  // (ej. arrastrar 3 .exe con un ALLOWLIST activo) no debe perder los otros
  // dos avisos por pisarse entre sí — se muestran de a uno, "Aceptar" pasa al
  // siguiente.
  const [validationErrors, setValidationErrors] = useState<AttachmentValidationError[]>([]);
  const nextId = useRef(0);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!token) return;
      Array.from(files).forEach((file) => {
        const localId = `${Date.now()}-${nextId.current++}`;
        setAttachments((prev) => [...prev, { localId, file, status: "uploading" }]);

        compressImage(file, file.name, IMAGE_COMPRESSION_PRESETS.message)
          .then((compressed) => {
            // Reemplaza el archivo mostrado en el chip por el comprimido —
            // así el tamaño que ve el usuario ya refleja lo que se sube.
            if (compressed !== file) {
              setAttachments((prev) =>
                prev.map((attachment) =>
                  attachment.localId === localId ? { ...attachment, file: compressed } : attachment,
                ),
              );
            }
            return uploadFile(token, compressed, conversationId);
          })
          .then((uploaded) => {
            setAttachments((prev) =>
              prev.map((attachment) =>
                attachment.localId === localId ? { ...attachment, status: "done", uploaded } : attachment,
              ),
            );
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : "Error al subir";
            setAttachments((prev) =>
              prev.map((attachment) =>
                attachment.localId === localId ? { ...attachment, status: "error", error: message } : attachment,
              ),
            );

            // El archivo se queda en `attachments` (con su chip en rojo) para
            // que el usuario pueda quitarlo a mano o reemplazarlo antes de
            // enviar — el modal es una explicación adicional, no un
            // auto-descarte.
            const reason = classifyUploadError(message);
            if (reason) {
              setValidationErrors((prev) => [...prev, { localId, fileName: file.name, reason }]);
            }
          });
      });
    },
    [token, conversationId],
  );

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.localId !== localId));
    setValidationErrors((prev) => prev.filter((entry) => entry.localId !== localId));
  }, []);

  // Cierra el modal actual (el primero de la cola) sin tocar `attachments` —
  // el archivo rechazado sigue seleccionado, ver el comentario en el catch de
  // `addFiles`.
  const dismissValidationError = useCallback((localId: string) => {
    setValidationErrors((prev) => prev.filter((entry) => entry.localId !== localId));
  }, []);

  const reset = useCallback(() => {
    setAttachments([]);
    setValidationErrors([]);
  }, []);

  const isUploading = attachments.some((attachment) => attachment.status === "uploading");
  const fileIds = attachments
    .filter((attachment) => attachment.status === "done" && attachment.uploaded)
    .map((attachment) => attachment.uploaded!.id);

  return {
    attachments,
    addFiles,
    removeAttachment,
    reset,
    isUploading,
    fileIds,
    validationErrors,
    dismissValidationError,
  };
}
