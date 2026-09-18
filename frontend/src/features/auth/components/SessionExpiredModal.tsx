"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal mostrado cuando el token JWT ha caducado o el backend responde 401.
 * Notifica al usuario que su sesión finalizó y ofrece un botón para cerrar el modal
 * y proceder a iniciar sesión nuevamente.
 */
export function SessionExpiredModal({ isOpen, onClose }: SessionExpiredModalProps) {
  if (!isOpen) return null;

  return (
    <Modal onClose={onClose} aria-label="Sesión expirada">
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
            <IconAlertCircle size={24} stroke={2} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-brand-ink dark:text-white">
              Sesión expirada
            </h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              Tu sesión ha expirado. Por favor, iniciá sesión nuevamente para continuar.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="primary" onClick={onClose} className="w-full sm:w-auto">
            Iniciar sesión
          </Button>
        </div>
      </div>
    </Modal>
  );
}
