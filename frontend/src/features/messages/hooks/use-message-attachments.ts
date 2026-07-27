"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { uploadFile } from "@/features/files/api/files.api";
import type { UploadedFile } from "@/features/files/types/file.types";

export type AttachmentStatus = "uploading" | "done" | "error";

export interface PendingAttachment {
  localId: string;
  file: File;
  status: AttachmentStatus;
  uploaded?: UploadedFile;
  error?: string;
}

/**
 * Sube cada archivo apenas se elige (no recién al enviar) — igual que
 * WhatsApp Web/Telegram: el usuario ve progreso o error por adjunto antes de
 * tocar "enviar", en vez de que todo el envío falle recién al final.
 */
export function useMessageAttachments() {
  const { session } = useAuth();
  const token = session?.token;
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const nextId = useRef(0);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!token) return;
      Array.from(files).forEach((file) => {
        const localId = `${Date.now()}-${nextId.current++}`;
        setAttachments((prev) => [...prev, { localId, file, status: "uploading" }]);

        uploadFile(token, file)
          .then((uploaded) => {
            setAttachments((prev) =>
              prev.map((attachment) =>
                attachment.localId === localId ? { ...attachment, status: "done", uploaded } : attachment,
              ),
            );
          })
          .catch((error) => {
            setAttachments((prev) =>
              prev.map((attachment) =>
                attachment.localId === localId
                  ? {
                      ...attachment,
                      status: "error",
                      error: error instanceof Error ? error.message : "Error al subir",
                    }
                  : attachment,
              ),
            );
          });
      });
    },
    [token],
  );

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.localId !== localId));
  }, []);

  const reset = useCallback(() => setAttachments([]), []);

  const isUploading = attachments.some((attachment) => attachment.status === "uploading");
  const fileIds = attachments
    .filter((attachment) => attachment.status === "done" && attachment.uploaded)
    .map((attachment) => attachment.uploaded!.id);

  return { attachments, addFiles, removeAttachment, reset, isUploading, fileIds };
}
