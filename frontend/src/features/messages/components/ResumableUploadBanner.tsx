"use client";

import { useRef } from "react";
import { IconCloudUpload, IconX } from "@tabler/icons-react";
import { formatFileSize } from "@/utils/file-format";
import type { PersistedUploadSession } from "@/features/files/lib/upload-persistence";

interface ResumableUploadBannerProps {
  session: PersistedUploadSession;
  onSelectFile: (file: File) => void;
  onDiscard: () => void;
  mismatchError?: string | null;
}

/**
 * Banner informativo que aparece cuando se detecta una sesión interrumpida previa
 * para la conversación, permitiendo volver a elegir el archivo para reanudar (§8.5).
 */
export function ResumableUploadBanner({
  session,
  onSelectFile,
  onDiscard,
  mismatchError,
}: ResumableUploadBannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    event.target.value = "";
  }

  return (
    <div className="mx-3 my-2 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-50/80 p-3 shadow-sm backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-950/40">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Seleccionar archivo para reanudar"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <IconCloudUpload size={18} stroke={2} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Subida interrumpida detectada
            </p>
            <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/80">
              Tenés una subida pendiente de{" "}
              <span className="font-semibold underline underline-offset-2">
                {session.fileName}
              </span>{" "}
              ({formatFileSize(session.fileSize)}). Volvé a elegirlo para continuar sin perder las
              partes ya subidas.
            </p>
            {mismatchError && (
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {mismatchError}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDiscard}
          aria-label="Descartar subida pendiente"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-amber-700/70 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-500/20"
        >
          <IconX size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 pl-10.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400"
        >
          Seleccionar archivo
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="text-xs text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
        >
          Descartar sesión
        </button>
      </div>
    </div>
  );
}
