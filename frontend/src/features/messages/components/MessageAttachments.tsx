"use client";

import { IconDownload } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { buildStoredFileUrl } from "@/utils/file-url";
import { downloadFile } from "@/utils/download-file";
import { formatFileSize, isAudioMimeType, isImageMimeType } from "@/utils/file-format";
import { cn } from "@/utils/cn";
import type { MessageFile } from "@/features/messages/types/message.types";

interface MessageAttachmentsProps {
  files: MessageFile[];
  isOwn: boolean;
}

/** Adjuntos de un mensaje ya enviado: imágenes en línea, el resto como tarjeta descargable. */
export function MessageAttachments({ files, isOwn }: MessageAttachmentsProps) {
  const { open: openLightbox } = useImageLightbox();

  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {files.map(({ id, file }) => {
        const url = buildStoredFileUrl(file.path);

        if (isImageMimeType(file.mimeType)) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => openLightbox({ url, name: file.originalName })}
              aria-label={`Ver imagen ${file.originalName}`}
              className="block w-full cursor-pointer overflow-hidden rounded-lg border-0 bg-transparent p-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.originalName} className="max-h-64 w-full object-cover" />
            </button>
          );
        }

        if (isAudioMimeType(file.mimeType)) {
          return (
            <div key={id} className="flex items-center gap-1.5">
              {/* Reproductor nativo: sin librería para esto, alcanza con play/pausa/seek. */}
              <audio controls src={url} className="h-9 min-w-0 flex-1" style={{ maxWidth: 240 }} />
              <button
                type="button"
                onClick={() => downloadFile(url, file.originalName)}
                aria-label={`Descargar ${file.originalName}`}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  isOwn ? "hover:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
                )}
              >
                <IconDownload size={16} className="opacity-70" />
              </button>
            </div>
          );
        }

        return (
          <button
            key={id}
            type="button"
            onClick={() => downloadFile(url, file.originalName)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
              isOwn
                ? "border-white/25 hover:bg-white/10"
                : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10",
            )}
          >
            <FileTypeIcon mimeType={file.mimeType} size={22} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{file.originalName}</p>
              <p className={cn("text-[11px]", isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500")}>
                {formatFileSize(file.size)}
              </p>
            </div>
            <IconDownload size={16} className="shrink-0 opacity-70" />
          </button>
        );
      })}
    </div>
  );
}
