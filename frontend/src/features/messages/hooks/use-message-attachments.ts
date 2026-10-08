"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { abortUpload } from "@/features/files/api/uploads.api";
import {
  ChunkedUploader,
  type ChunkedUploadProgress,
  type ChunkedUploadStatus,
} from "@/features/files/lib/chunked-uploader";
import {
  getUploadSession,
  removeUploadSession,
  type PersistedUploadSession,
} from "@/features/files/lib/upload-persistence";
import { compressImage, IMAGE_COMPRESSION_PRESETS } from "@/utils/compress-image";
import { isImageMimeType } from "@/utils/file-format";
import type { UploadedFile } from "@/features/files/types/file.types";

/** Umbral interno que divide el camino directo (≤ 16 MiB) del chunked (> 16 MiB, solo con
 * almacenamiento S3: ver `PublicAppSettings.chunkedUploads`) (§4, §12). */
export const CHUNKED_UPLOAD_THRESHOLD_BYTES = 16 * 1024 * 1024;

export type AttachmentStatus = ChunkedUploadStatus;

export interface PendingAttachment {
  localId: string;
  file: File;
  status: AttachmentStatus;
  uploaded?: UploadedFile;
  error?: string;
  progress?: ChunkedUploadProgress;
  uploader?: ChunkedUploader;
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
/// MulterError (techo fijo de 32MB, `ABSOLUTE_MAX_UPLOAD_BYTES`) usa su
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
  // Sin los ajustes cargados no se asume subida por partes (solo existe con S3): el camino
  // directo es el que siempre funciona. El máximo es el efectivo que informa el backend.
  const chunkedUploads = publicSettings?.chunkedUploads ?? false;
  const maxUploadBytes = publicSettings ? publicSettings.maxUploadSizeMb * 1024 * 1024 : null;

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Cola en vez de un solo valor: soltar varios archivos rechazados a la vez
  // (ej. arrastrar 3 .exe con un ALLOWLIST activo) no debe perder los otros
  // dos avisos por pisarse entre sí — se muestran de a uno, "Aceptar" pasa al
  // siguiente.
  const [validationErrors, setValidationErrors] = useState<AttachmentValidationError[]>([]);
  const [resumableSession, setResumableSession] = useState<PersistedUploadSession | null>(null);
  const [resumableMismatchError, setResumableMismatchError] = useState<string | null>(null);
  const nextId = useRef(0);

  // Cargar sesión reanudable pendiente al cambiar de conversación o montar (§8.5)
  useEffect(() => {
    setResumableSession(getUploadSession(conversationId));
    setResumableMismatchError(null);
  }, [conversationId]);

  // Ref espejo de `attachments.length` para leer la cantidad actual de forma
  // síncrona dentro de `addFiles` sin tener que declarar `attachments` como
  // dependencia (eso recrearía el callback en cada archivo agregado/subido).
  const attachmentsCountRef = useRef(0);
  useEffect(() => {
    attachmentsCountRef.current = attachments.length;
  }, [attachments]);

  const startUpload = useCallback(
    (fileToUpload: File, localId: string, existingSessionId?: string) => {
      if (!token) return;

      // Se valida acá, después de comprimir las imágenes, con el tamaño que de verdad se sube.
      // Sin esto, un archivo demasiado grande se subía entero antes de que el servidor lo rechazara.
      if (maxUploadBytes != null && fileToUpload.size > maxUploadBytes) {
        setAttachments((prev) =>
          prev.map((att) =>
            att.localId === localId
              ? {
                  ...att,
                  status: "error",
                  error: `File exceeds the maximum allowed size of ${Math.round(maxUploadBytes / (1024 * 1024))}MB`,
                }
              : att,
          ),
        );
        setValidationErrors((prev) => [
          ...prev,
          { id: localId, fileName: fileToUpload.name, reason: { kind: "size-limit" } },
        ]);
        return;
      }

      if (chunkedUploads && fileToUpload.size > CHUNKED_UPLOAD_THRESHOLD_BYTES) {
        // Camino chunked (> 16 MiB) directo a S3 vía multipart
        const uploader = new ChunkedUploader({
          file: fileToUpload,
          token,
          conversationId,
          existingSessionId,
          onStatusChange: (newStatus: ChunkedUploadStatus) => {
            setAttachments((prev) =>
              prev.map((att) =>
                att.localId === localId
                  ? {
                      ...att,
                      status: newStatus,
                    }
                  : att,
              ),
            );
          },
          onProgress: (progress: ChunkedUploadProgress) => {
            setAttachments((prev) =>
              prev.map((att) => (att.localId === localId ? { ...att, progress } : att)),
            );
          },
        });

        setAttachments((prev) =>
          prev.map((att) =>
            att.localId === localId
              ? {
                  ...att,
                  uploader,
                  status: "initiating",
                  progress: {
                    loadedBytes: 0,
                    totalBytes: fileToUpload.size,
                    percentage: 0,
                  },
                }
              : att,
          ),
        );

        uploader
          .start()
          .then((uploaded) => {
            setAttachments((prev) =>
              prev.map((att) =>
                att.localId === localId ? { ...att, status: "done", uploaded } : att,
              ),
            );
          })
          .catch((error) => {
            if (uploader.getStatus() === "canceled") return;
            const message = error instanceof Error ? error.message : "Error al subir";
            setAttachments((prev) =>
              prev.map((att) =>
                att.localId === localId ? { ...att, status: "error", error: message } : att,
              ),
            );

            const reason = classifyUploadError(message);
            if (reason) {
              setValidationErrors((prev) => [
                ...prev,
                { id: localId, fileName: fileToUpload.name, reason },
              ]);
            }
          });
      } else {
        // Camino directo vía POST /v1/files: hasta 16 MiB, y hasta el máximo efectivo (32 MB)
        // cuando no hay subida por partes.
        uploadFile(token, fileToUpload, conversationId)
          .then((uploaded) => {
            setAttachments((prev) =>
              prev.map((att) =>
                att.localId === localId ? { ...att, status: "done", uploaded } : att,
              ),
            );
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : "Error al subir";
            setAttachments((prev) =>
              prev.map((att) =>
                att.localId === localId ? { ...att, status: "error", error: message } : att,
              ),
            );

            const reason = classifyUploadError(message);
            if (reason) {
              setValidationErrors((prev) => [
                ...prev,
                { id: localId, fileName: fileToUpload.name, reason },
              ]);
            }
          });
      }
    },
    [token, conversationId, chunkedUploads, maxUploadBytes],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!token) return;
      const incoming = Array.from(files);

      // Tope de cantidad por mensaje: se aplica ANTES de subir nada
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
            reason: {
              kind: "too-many-files",
              limit: maxFilesPerMessage,
              attemptedCount: incoming.length,
            },
          },
        ]);
      }

      accepted.forEach((file) => {
        const localId = `${Date.now()}-${nextId.current++}`;
        setAttachments((prev) => [...prev, { localId, file, status: "uploading" }]);

        if (isImageMimeType(file.type)) {
          compressImage(file, file.name, IMAGE_COMPRESSION_PRESETS.message)
            .then((compressed) => {
              if (compressed !== file) {
                setAttachments((prev) =>
                  prev.map((attachment) =>
                    attachment.localId === localId
                      ? { ...attachment, file: compressed }
                      : attachment,
                  ),
                );
              }
              startUpload(compressed, localId);
            })
            .catch(() => {
              startUpload(file, localId);
            });
        } else {
          startUpload(file, localId);
        }
      });
    },
    [token, maxFilesPerMessage, startUpload],
  );

  /** Reanuda una sesión multipart previa pidiendo al usuario el archivo correspondiente (§8.5). */
  const resumeSessionWithFile = useCallback(
    (file: File): boolean => {
      if (!resumableSession) return false;

      const isNameMatch = file.name === resumableSession.fileName;
      const isSizeMatch = file.size === resumableSession.fileSize;
      const isTimeMatch =
        !resumableSession.lastModified ||
        Math.abs(file.lastModified - resumableSession.lastModified) <= 2000;

      if (!isNameMatch || !isSizeMatch || !isTimeMatch) {
        setResumableMismatchError(
          "El archivo seleccionado no coincide con la subida pendiente (nombre o tamaño diferente).",
        );
        return false;
      }

      setResumableMismatchError(null);
      const sessionToResume = resumableSession;
      setResumableSession(null);

      const localId = `${Date.now()}-${nextId.current++}`;
      setAttachments((prev) => [...prev, { localId, file, status: "uploading" }]);
      startUpload(file, localId, sessionToResume.sessionId);
      return true;
    },
    [resumableSession, startUpload],
  );

  /** Descarta una sesión multipart pendiente y aborta la subida en el storage (§8.5). */
  const discardResumableSession = useCallback(() => {
    if (!resumableSession) return;
    const { sessionId } = resumableSession;
    removeUploadSession(sessionId);
    setResumableSession(null);
    setResumableMismatchError(null);
    if (token) {
      void abortUpload(token, sessionId).catch(() => {});
    }
  }, [resumableSession, token]);

  const pauseAttachment = useCallback((localId: string) => {
    setAttachments((prev) =>
      prev.map((att) => {
        if (att.localId === localId && att.uploader) {
          att.uploader.pause();
          return { ...att, status: "paused" };
        }
        return att;
      }),
    );
  }, []);

  const resumeAttachment = useCallback((localId: string) => {
    setAttachments((prev) =>
      prev.map((att) => {
        if (att.localId === localId && att.uploader) {
          void att.uploader.resume();
          return { ...att, status: "uploading" };
        }
        return att;
      }),
    );
  }, []);

  const retryAttachment = useCallback(
    (localId: string) => {
      const target = attachments.find((att) => att.localId === localId);
      if (!target) return;

      setAttachments((prev) =>
        prev.map((att) =>
          att.localId === localId ? { ...att, status: "uploading", error: undefined } : att,
        ),
      );
      startUpload(target.file, localId);
    },
    [attachments, startUpload],
  );

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.localId === localId);
      if (target?.uploader && target.status !== "done") {
        void target.uploader.cancel();
      }
      return prev.filter((att) => att.localId !== localId);
    });
    setValidationErrors((prev) => prev.filter((entry) => entry.id !== localId));
  }, []);

  /** Remueve únicamente los adjuntos que acaban de ser enviados en un mensaje (§8.3). */
  const removeSentAttachments = useCallback((sentFileIds: string[]) => {
    setAttachments((prev) =>
      prev.filter((att) => !att.uploaded || !sentFileIds.includes(att.uploaded.id)),
    );
  }, []);

  const dismissValidationError = useCallback((id: string) => {
    setValidationErrors((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const reset = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.uploader && att.status !== "done") {
          void att.uploader.cancel();
        }
      }
      return [];
    });
    setValidationErrors([]);
  }, []);

  const isUploading = attachments.some(
    (att) =>
      att.status === "uploading" ||
      att.status === "initiating" ||
      att.status === "retrying" ||
      att.status === "resuming" ||
      att.status === "completing" ||
      att.status === "offline",
  );

  const fileIds = attachments
    .filter((attachment) => attachment.status === "done" && attachment.uploaded)
    .map((attachment) => attachment.uploaded!.id);

  return {
    attachments,
    addFiles,
    pauseAttachment,
    resumeAttachment,
    retryAttachment,
    removeAttachment,
    removeSentAttachments,
    reset,
    isUploading,
    fileIds,
    validationErrors,
    dismissValidationError,
    resumableSession,
    resumableMismatchError,
    resumeSessionWithFile,
    discardResumableSession,
  };
}
