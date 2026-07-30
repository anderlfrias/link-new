"use client";

import { useEffect } from "react";

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}

/** Overlay centrado genérico (backdrop + Escape para cerrar), mismo patrón que
 * ImageLightboxProvider pero como card en vez de a pantalla completa. */
export function Modal({ onClose, children, "aria-label": ariaLabel }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-900"
      >
        {children}
      </div>
    </div>
  );
}
