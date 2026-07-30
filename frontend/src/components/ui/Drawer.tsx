"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";

interface DrawerProps {
  onClose: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}

/** Panel lateral que entra deslizando desde la derecha — mismo backdrop +
 * Escape-para-cerrar que Modal, pero anclado al borde y a todo el alto en vez
 * de una card centrada (para paneles de "detalle", tipo WhatsApp/Telegram,
 * en vez de un diálogo de acción puntual). */
export function Drawer({ onClose, children, "aria-label": ariaLabel }: DrawerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Monta ya en el DOM pero trasladado fuera de pantalla, y recién en el
    // siguiente frame activa la transición — si arrancara con `visible` ya en
    // true no habría un "antes" que animar y el panel aparecería de golpe.
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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
      className={cn(
        "fixed inset-0 z-50 flex justify-end bg-black/40 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex h-full w-full max-w-sm flex-col overflow-hidden border-l border-black/5 bg-white shadow-lg transition-transform duration-300 ease-out dark:border-white/10 dark:bg-neutral-900",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
