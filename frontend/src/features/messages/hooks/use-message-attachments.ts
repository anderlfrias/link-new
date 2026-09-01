"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
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

/** Los tres rechazos que ameritan interrumpir al usuario con un modal en vez de dejarlo solo en
 * el chip (o, para `too-many-files`, sin ningún chip) — son configuración del admin (tipo de
 * archivo, tamaño máximo, cantidad por mensaje), no un error de red o del servidor, así que vale
 * la pena explicarlos. */
export type AttachmentFailureReason =
  | { kind: "unsupported-type"; mimeType: string }
  | { kind: "size-limit" }
  | { kind: "too-many-files"; limit: number; attemptedCount: number };

export interface AttachmentValidationError {
  /** Para `unsupported-type`/`size-limit` es el `localId` del adjunto rechazado (así
   * `removeAttachment` puede limpiar el aviso pendiente si el usuario lo saca antes de leerlo).
   * Para `too-many-files` no hay un adjunto asociado (los archivos de más ni se agregan) — es un
   * id sintético solo para la cola. */
  id: string;
  /** Ausente en `too-many-files`: no hay un único archivo al que apunte el aviso. */
  fileName?: string;
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
  const publicSettings = usePublicSettings();
  // null = sin límite todavía conocido (settings sin cargar) o deshabilitado
  // por el admin (`maxFilesPerMessage: null`) — en ambos casos, no frenar acá:
  // la autoridad real es `message.service.ts#sendMessage`, que rechaza el
  // POST si de verdad hay más de la cuenta.
  const maxFilesPerMessage = publicSettings?.maxFilesPerMessage ?? null;

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Cola en vez de un solo valor: soltar varios archivos rechazados a la vez
  // (ej. arrastrar 3 .exe con un ALLOWLIST activo) no debe perder los otros
  // dos avisos por pisarse entre sí — se muestran de a uno, "Aceptar" pasa al
  // siguiente.
  const [validationErrors, setValidationErrors] = useState<AttachmentValidationError[]>([]);
  const nextId = useRef(0);

  // Ref espejo de `attachments.length` para leer la cantidad actual de forma
  // síncrona dentro de `addFiles` sin tener que declarar `attachments` como
  // dependencia (eso recrearía el callback en cada archivo agregado/subido).
  const attachmentsCountRef = useRef(0);
  useEffect(() => {
    attachmentsCountRef.current = attachments.length;
  }, [attachments]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!token) return;
      const incoming = Array.from(files);

      // Tope de cantidad por mensaje: se aplica ANTES de subir nada — los
      // archivos que exceden el límite ni se agregan como chip (a diferencia
      // de un rechazo por tipo/tamaño, acá no hay "el archivo se sube y
      // falla", el archivo nunca llega a intentarse).
      const remainingSlots =
        maxFilesPerMessage == null
          ? incoming.length
          : Math.max(maxFilesPerMessage - attachmentsCountRef.current, 0);
      const accepted = incoming.slice(0, remainingSlots);
      const rejectedCount = incoming.length - accepted.length;

      if (rejectedCount > 0 && maxFilesPerMessage != null) {
        setValidationErrors((prev) => [
          ...prev,
          {
            id: `too-many-files-${Date.now()}`,
            reason: { kind: "too-many-files", limit: maxFilesPerMessage, attemptedCount: incoming.length },
          },
        ]);
      }

      accepted.forEach((file) => {
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
              setValidationErrors((prev) => [...prev, { id: localId, fileName: file.name, reason }]);
            }
          });
      });
    },
    [token, conversationId, maxFilesPerMessage],
  );

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.localId !== localId));
    setValidationErrors((prev) => prev.filter((entry) => entry.id !== localId));
  }, []);

  // Cierra el modal actual (el primero de la cola) sin tocar `attachments` —
  // el archivo rechazado (si lo hay) sigue seleccionado, ver el comentario en
  // el catch de `addFiles`.
  const dismissValidationError = useCallback((id: string) => {
    setValidationErrors((prev) => prev.filter((entry) => entry.id !== id));
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
