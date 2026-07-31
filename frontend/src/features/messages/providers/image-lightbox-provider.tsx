"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IconDownload, IconX } from "@tabler/icons-react";
import { downloadFile } from "@/utils/download-file";

interface LightboxImage {
  url: string;
  name: string;
}

interface ImageLightboxContextValue {
  open: (image: LightboxImage) => void;
}

const ImageLightboxContext = createContext<ImageLightboxContextValue | null>(null);

/**
 * Visor de imagen a pantalla completa, estilo WhatsApp/Telegram: tocar la
 * miniatura de una foto en el chat la abre acá en vez de navegar a una
 * pestaña nueva. Vive como provider (no como estado local de cada burbuja)
 * porque el overlay es uno solo para toda la conversación.
 */
export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = useState<LightboxImage | null>(null);

  const open = useCallback((next: LightboxImage) => setImage(next), []);
  const close = useCallback(() => setImage(null), []);

  useEffect(() => {
    if (!image) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image, close]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <ImageLightboxContext.Provider value={value}>
      {children}
      {image && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={image.name}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconX size={22} stroke={1.75} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void downloadFile(image.url, image.name);
            }}
            aria-label="Descargar imagen"
            className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconDownload size={20} stroke={1.75} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.name}
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </ImageLightboxContext.Provider>
  );
}

export function useImageLightbox(): ImageLightboxContextValue {
  const context = useContext(ImageLightboxContext);
  if (!context) {
    throw new Error("useImageLightbox debe usarse dentro de un ImageLightboxProvider");
  }
  return context;
}
