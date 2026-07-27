import { IconDownload } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { buildStoredFileUrl } from "@/utils/file-url";
import { formatFileSize, isImageMimeType } from "@/utils/file-format";
import { cn } from "@/utils/cn";
import type { MessageFile } from "@/features/messages/types/message.types";

interface MessageAttachmentsProps {
  files: MessageFile[];
  isOwn: boolean;
}

/** Adjuntos de un mensaje ya enviado: imágenes en línea, el resto como tarjeta descargable. */
export function MessageAttachments({ files, isOwn }: MessageAttachmentsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {files.map(({ id, file }) => {
        const url = buildStoredFileUrl(file.path);

        if (isImageMimeType(file.mimeType)) {
          return (
            <a key={id} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.originalName} className="max-h-64 w-full object-cover" />
            </a>
          );
        }

        return (
          <a
            key={id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
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
          </a>
        );
      })}
    </div>
  );
}
