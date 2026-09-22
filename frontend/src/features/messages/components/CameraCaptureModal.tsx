"use client";

import { useEffect, useRef } from "react";
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useCamera } from "@/features/messages/hooks/use-camera";
import { cn } from "@/utils/cn";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const {
    status,
    error,
    stream,
    facingMode,
    capturedUrl,
    startCamera,
    stopCamera,
    switchCamera,
    capture,
    retake,
    confirmPhoto,
  } = useCamera();

  const videoRef = useRef<HTMLVideoElement>(null);

  // Iniciar cámara cuando el modal se abre, y apagarla al cerrarse
  useEffect(() => {
    if (open) {
      void startCamera("user");
    } else {
      stopCamera();
    }
  }, [open, startCamera, stopCamera]);

  // Conectar el stream al elemento de video
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // Ignorar interrupciones si se cierra rápido
      });
    }
  }, [stream]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleTakePicture() {
    await capture(videoRef.current);
  }

  function handleConfirm() {
    const file = confirmPhoto();
    if (file) {
      onCapture(file);
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cámara"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 text-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <IconCamera size={18} className="text-brand-blue" />
            <span>Tomar fotografía</span>
          </div>
          <div className="flex items-center gap-1">
            {(status === "ready" || status === "requesting") && (
              <button
                type="button"
                onClick={() => void switchCamera()}
                title="Cambiar cámara (frontal / trasera)"
                aria-label="Cambiar cámara"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <IconRefresh size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar cámara"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        {/* Visor de cámara / Foto congelada */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black flex items-center justify-center">
          {status === "requesting" && (
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <IconLoader2 size={32} className="animate-spin text-brand-blue" />
              <span className="text-xs">Iniciando cámara...</span>
            </div>
          )}

          {status === "error" && (
            <div className="flex max-w-xs flex-col items-center gap-3 p-6 text-center text-neutral-300">
              <IconAlertCircle size={36} className="text-red-400" />
              <p className="text-xs">{error ?? "Ocurrió un error al acceder a la cámara."}</p>
              <button
                type="button"
                onClick={() => void startCamera(facingMode)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                Reintentar
              </button>
            </div>
          )}

          {status === "ready" && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Visor de cámara"
              className={cn(
                "h-full w-full object-cover",
                facingMode === "user" && "-scale-x-100", // Efecto espejo para selfies
              )}
            />
          )}

          {status === "captured" && capturedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedUrl}
              alt="Foto capturada"
              className="h-full w-full object-cover animate-in fade-in duration-150"
            />
          )}
        </div>

        {/* Barra de acciones inferior */}
        <div className="flex items-center justify-center border-t border-white/10 bg-neutral-950/60 px-4 py-4">
          {status === "ready" && (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => void handleTakePicture()}
                aria-label="Tomar foto"
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 p-1 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <div className="h-full w-full rounded-full bg-white shadow" />
              </button>
            </div>
          )}

          {status === "captured" && (
            <div className="flex w-full items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => void retake()}
                aria-label="Repetir foto"
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/20 hover:text-white"
              >
                <IconRefresh size={16} />
                <span>Repetir</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                aria-label="Usar foto"
                className="flex items-center gap-2 rounded-xl bg-brand-blue px-5 py-2 text-sm font-medium text-white shadow transition-all hover:bg-brand-blue/90"
              >
                <IconCheck size={16} />
                <span>Usar foto</span>
              </button>
            </div>
          )}

          {(status === "requesting" || status === "error") && (
            <div className="h-10 flex items-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-neutral-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
