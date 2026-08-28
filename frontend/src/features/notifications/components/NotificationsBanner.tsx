"use client";

import { useState } from "react";
import { IconBell, IconBellOff, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { usePushNotifications } from "@/features/notifications/hooks/use-push-notifications";

/** Banner tipo WhatsApp Web ("Activá las notificaciones..."): solo aparece
 * mientras el permiso no esté concedido. El click en "Activar" es lo que
 * dispara el prompt nativo del navegador — pedirlo sin un gesto del usuario
 * (ej. al cargar la página) hace que la mayoría de los navegadores lo
 * bloqueen o lo rechacen solos. */
export function NotificationsBanner() {
  const { permission, isSupported, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (!isSupported || dismissed || permission === null || permission === "granted") return null;

  const isBlocked = permission === "denied";

  return (
    <div className="flex items-center gap-3 border-b border-black/5 bg-brand-blue/5 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-brand-blue/10">
      {isBlocked ? (
        <IconBellOff size={18} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      ) : (
        <IconBell size={18} className="shrink-0 text-brand-blue" />
      )}
      <p className="min-w-0 flex-1 text-brand-ink dark:text-white">
        {isBlocked
          ? "Las notificaciones están bloqueadas. Habilitalas desde la configuración del navegador para este sitio."
          : "Activá las notificaciones para enterarte de los mensajes nuevos aunque no tengas la app abierta."}
      </p>
      {!isBlocked && (
        <Button type="button" onClick={() => void requestPermission()} className="shrink-0 px-3 py-1.5">
          Activar
        </Button>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}
