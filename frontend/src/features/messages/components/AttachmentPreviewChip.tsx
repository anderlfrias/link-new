"use client";

import { useEffect, useState } from "react";
import { IconAlertCircle, IconLoader2, IconX } from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { formatFileSize, isImageMimeType } from "@/utils/file-format";
import { cn } from "@/utils/cn";
import type { PendingAttachment } from "@/features/messages/hooks/use-message-attachments";

interface AttachmentPreviewChipProps {
  attachment: PendingAttachment;
  onRemove: () => void;
}

/** Chip del adjunto todavía no enviado, con su propio estado de subida/error. */
export function AttachmentPreviewChip({ attachment, onRemove }: AttachmentPreviewChipProps) {
  const { file, status, error } = attachment;
  const isImage = isImageMimeType(file.type);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div
      className={cn(
        "relative flex w-40 shrink-0 items-center gap-2 rounded-xl border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-white/5",
        status === "error" && "border-red-400 dark:border-red-500/60",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon mimeType={file.type} size={20} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-brand-ink dark:text-white">{file.name}</p>
        <p className="truncate text-[11px] text-neutral-400">
          {status === "error" ? (error ?? "Error al subir") : formatFileSize(file.size)}
        </p>
      </div>
      {status === "uploading" && <IconLoader2 size={14} className="shrink-0 animate-spin text-brand-blue" />}
      {status === "error" && <IconAlertCircle size={14} className="shrink-0 text-red-500" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar adjunto"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-500 text-white shadow-sm hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500"
      >
        <IconX size={12} stroke={2} />
      </button>
    </div>
  );
}
