"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  IconBrush,
  IconCategory,
  IconCloudUpload,
  IconLoader2,
  IconPhoto,
  IconX,
} from "@tabler/icons-react";
import type { AvatarStyleDef } from "@/constants/avatar-catalog";
import { AvatarIllustrationPicker } from "./AvatarIllustrationPicker";
import { AvatarCustomizerView } from "./AvatarCustomizerView";
import { BoringAvatarPicker } from "./BoringAvatarPicker";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";

type ModalTab = "illustrations" | "abstract" | "upload";

interface AvatarSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSeed: string;
  onSelectImage: (blob: Blob, filename?: string) => Promise<void> | void;
  disabled?: boolean;
}

export function AvatarSelectionModal({
  isOpen,
  onClose,
  userSeed,
  onSelectImage,
  disabled = false,
}: AvatarSelectionModalProps) {
  const [currentTab, setCurrentTab] = useState<ModalTab>("illustrations");
  const [customizingStyle, setCustomizingStyle] = useState<{
    styleDef: AvatarStyleDef;
    seed: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manejo de Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;
      if (event.key === "Escape") {
        if (customizingStyle) {
          setCustomizingStyle(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, customizingStyle, onClose]);

  if (!isOpen) return null;

  async function handleIllustrationPick(blob: Blob) {
    setIsUploading(true);
    try {
      await onSelectImage(blob, "avatar-illustration.png");
      setCustomizingStyle(null);
      onClose();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleBoringAvatarPick(blob: Blob) {
    setIsUploading(true);
    try {
      await onSelectImage(blob, "avatar-boring.png");
      onClose();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFileUpload(file: File) {
    setIsUploading(true);
    try {
      await onSelectImage(file, file.name);
      onClose();
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFileUpload(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      void handleFileUpload(file);
    }
  }

  const isBusy = disabled || isUploading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar foto de perfil"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[88vh] max-h-[700px] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900"
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light">
              <IconPhoto size={20} stroke={2} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-brand-ink dark:text-white">
                Foto de perfil
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Elegí una ilustración o subí una imagen propia
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Cerrar modal"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Pestañas de navegación (sólo si no estamos en la vista de personalización) */}
        {!customizingStyle && (
          <div className="flex border-b border-black/5 bg-neutral-50/50 px-5 dark:border-white/5 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setCurrentTab("illustrations")}
              className={cn(
                "flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors",
                currentTab === "illustrations"
                  ? "border-brand-blue text-brand-blue dark:text-brand-blue-light"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
              )}
            >
              <IconBrush size={16} />
              <span>Ilustraciones</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab("abstract")}
              className={cn(
                "flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors",
                currentTab === "abstract"
                  ? "border-brand-blue text-brand-blue dark:text-brand-blue-light"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
              )}
            >
              <IconCategory size={16} />
              <span>Abstractos</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab("upload")}
              className={cn(
                "flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-colors",
                currentTab === "upload"
                  ? "border-brand-blue text-brand-blue dark:text-brand-blue-light"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
              )}
            >
              <IconCloudUpload size={16} />
              <span>Subir archivo</span>
            </button>
          </div>
        )}

        {/* Contenido según la pestaña o subvista */}
        <div className="flex-1 overflow-hidden relative">
          {customizingStyle ? (
            <AvatarCustomizerView
              styleDef={customizingStyle.styleDef}
              initialSeed={customizingStyle.seed}
              onBack={() => setCustomizingStyle(null)}
              onConfirm={handleIllustrationPick}
              disabled={isBusy}
            />
          ) : currentTab === "illustrations" ? (
            <AvatarIllustrationPicker
              userSeed={userSeed}
              onSelectIllustration={(styleDef, seed) => {
                setCustomizingStyle({ styleDef, seed });
              }}
              disabled={isBusy}
            />
          ) : currentTab === "abstract" ? (
            <div className="flex-1 h-full overflow-y-auto p-5">
              <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                Seleccioná una variante de formas generativas basada en tu usuario.
              </p>
              <BoringAvatarPicker
                seed={userSeed}
                onSelect={handleBoringAvatarPick}
                disabled={isBusy}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex w-full max-w-md cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all",
                  isDragging
                    ? "border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10"
                    : "border-black/10 bg-neutral-50/50 hover:border-brand-blue/50 hover:bg-neutral-100/50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20",
                )}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light">
                  <IconCloudUpload size={28} stroke={1.75} />
                </div>
                <h3 className="text-sm font-semibold text-brand-ink dark:text-white">
                  Arrastrá tu foto acá o hacé clic para explorar
                </h3>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Compatible con JPG, PNG, WebP o GIF (hasta 5 MB)
                </p>
                <Button
                  type="button"
                  disabled={isBusy}
                  className="mt-4 pointer-events-none py-1.5 px-3 text-xs"
                >
                  Seleccionar desde mi dispositivo
                </Button>
              </div>
            </div>
          )}

          {/* Overlay de carga global si está subiendo */}
          {isUploading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xs dark:bg-neutral-900/70">
              <IconLoader2 size={36} className="animate-spin text-brand-blue" />
              <p className="mt-3 text-xs font-semibold text-brand-ink dark:text-white">
                Guardando tu nueva foto de perfil...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
