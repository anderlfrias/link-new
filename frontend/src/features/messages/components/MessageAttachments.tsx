"use client";

import { IconDownload, IconFileOff } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { VoiceNotePlayer } from "@/features/messages/components/VoiceNotePlayer";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { resolveFileUrl } from "@/utils/file-url";
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
        // El archivo fue borrado físicamente desde el panel de admin — nunca
        // intentar renderizar imagen/audio/descarga para un mimetype que ya
        // no existe en el servidor, mismo criterio visual que "Mensaje
        // eliminado" en MessageBubble.tsx (itálica, gris apagado).
        if (file.deletedAt) {
          return (
            <div
              key={id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left",
                isOwn ? "border-white/25" : "border-black/10 dark:border-white/10",
              )}
            >
              <IconFileOff size={22} stroke={1.5} className="shrink-0 opacity-50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium italic text-neutral-400 dark:text-neutral-500">
                  {file.originalName}
                </p>
                <p className="text-[11px] italic text-neutral-400 dark:text-neutral-500">
                  Este archivo ya no está disponible: fue eliminado.
                </p>
              </div>
            </div>
          );
        }

        const url = resolveFileUrl(file);

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
          return <VoiceNotePlayer key={id} url={url} filename={file.originalName} isOwn={isOwn} />;
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
