"use client";

import { useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRefresh,
  IconWifiOff,
  IconX,
} from "@tabler/icons-react";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { useUploadProgress } from "@/features/files/hooks/use-upload-progress";
import { formatFileSize, isImageMimeType } from "@/utils/file-format";
import { cn } from "@/utils/cn";
import type { PendingAttachment } from "@/features/messages/hooks/use-message-attachments";

interface AttachmentPreviewChipProps {
  attachment: PendingAttachment;
  onRemove: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
}

/** Chip del adjunto en preparación o subida, con progreso fluido, métricas y controles (§8.1, §8.4, §8.5). */
export function AttachmentPreviewChip({
  attachment,
  onRemove,
  onPause,
  onResume,
  onRetry,
}: AttachmentPreviewChipProps) {
  const { file, status, error } = attachment;
  const isImage = isImageMimeType(file.type);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isUploadingState =
    status === "uploading" ||
    status === "initiating" ||
    status === "retrying" ||
    status === "resuming" ||
    status === "completing";

  const { percentage, speedFormatted, etaFormatted } = useUploadProgress({
    loadedBytes: attachment.progress?.loadedBytes ?? (status === "done" ? file.size : 0),
    totalBytes: file.size,
    isUploading: isUploadingState,
  });

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div
      className={cn(
        "relative flex min-w-44 max-w-56 shrink-0 items-center gap-2.5 rounded-xl border border-black/10 bg-white p-2.5 shadow-sm transition-all dark:border-white/10 dark:bg-neutral-900/90",
        status === "error" && "border-red-400 dark:border-red-500/60",
        (status === "paused" || status === "offline") && "border-amber-300 dark:border-amber-500/50",
      )}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon mimeType={file.type} size={22} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-brand-ink dark:text-white" title={file.name}>
          {file.name}
        </p>

        {status === "error" ? (
          <p className="truncate text-[11px] font-medium text-red-500" title={error ?? "Error al subir"}>
            {error ?? "Error al subir"}
          </p>
        ) : status === "offline" ? (
          <p className="truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Sin conexión • En pausa
          </p>
        ) : status === "paused" ? (
          <p className="truncate text-[11px] font-medium text-amber-500">Pausado • {percentage}%</p>
        ) : status === "retrying" ? (
          <p className="truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Reintentando... {percentage}%
          </p>
        ) : status === "completing" ? (
          <p className="truncate text-[11px] font-medium text-brand-blue">Finalizando...</p>
        ) : isUploadingState ? (
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            {percentage}%
            {speedFormatted ? ` • ${speedFormatted}` : ""}
            {etaFormatted ? ` • ${etaFormatted}` : ""}
          </p>
        ) : (
          <p className="truncate text-[11px] text-neutral-400">{formatFileSize(file.size)}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Controles de pausa/reanudación/reintento */}
        {isUploadingState && onPause && (
          <button
            type="button"
            onClick={onPause}
            aria-label="Pausar subida"
            className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconPlayerPauseFilled size={12} />
          </button>
        )}

        {status === "paused" && onResume && (
          <button
            type="button"
            onClick={onResume}
            aria-label="Reanudar subida"
            className="flex h-6 w-6 items-center justify-center rounded-full text-brand-blue transition-colors hover:bg-brand-blue/10"
          >
            <IconPlayerPlayFilled size={12} />
          </button>
        )}

        {status === "error" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Reintentar subida"
            className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10"
          >
            <IconRefresh size={14} />
          </button>
        )}

        {/* Indicador de estado */}
        {isUploadingState && (
          <IconLoader2 size={14} className="shrink-0 animate-spin text-brand-blue" />
        )}
        {status === "offline" && (
          <IconWifiOff size={14} className="shrink-0 text-amber-500" />
        )}
        {status === "error" && !onRetry && (
          <IconAlertCircle size={14} className="shrink-0 text-red-500" />
        )}
      </div>

      {/* Botón eliminar/cancelar */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar adjunto"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500"
      >
        <IconX size={12} stroke={2.5} />
      </button>

      {/* Barra de progreso visual integrada */}
      {status !== "done" && status !== "error" && (
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-black/5 dark:bg-white/10">
          <div
            className={cn(
              "h-full transition-all duration-200 ease-out",
              status === "paused" || status === "offline" ? "bg-amber-400" : "bg-brand-blue",
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
