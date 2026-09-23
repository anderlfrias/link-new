"use client";

import React from "react";
import { IconPhone, IconPhoneOff, IconVideo } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "../hooks/use-call";

export function IncomingCallModal() {
  const { callState, activeCall, acceptCall, rejectCall } = useCall();

  if (callState !== "incoming" || !activeCall) {
    return null;
  }

  const isVideo = activeCall.type === "VIDEO";
  const callerName = activeCall.callerName || "Usuario";

  return (
    <div
      role="dialog"
      aria-label="Llamada entrante"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-neutral-900 border border-black/10 dark:border-white/10">
        {/* Avatar y animación de timbrado */}
        <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand-blue/20 dark:bg-brand-blue/30" />
          <div className="relative">
            <Avatar name={callerName} size="xl" />
          </div>
        </div>

        {/* Nombre y tipo de llamada */}
        <h2 className="text-xl font-bold text-brand-ink dark:text-white truncate">
          {callerName}
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          {isVideo ? (
            <>
              <IconVideo size={18} className="text-brand-blue" />
              <span>Videollamada entrante...</span>
            </>
          ) : (
            <>
              <IconPhone size={18} className="text-brand-blue" />
              <span>Llamada de voz entrante...</span>
            </>
          )}
        </p>

        {/* Botones de acción */}
        <div className="mt-8 flex items-center justify-center gap-8">
          {/* Rechazar */}
          <button
            type="button"
            onClick={() => void rejectCall("declined")}
            aria-label="Rechazar llamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 transition-transform hover:scale-105 active:scale-95"
          >
            <IconPhoneOff size={26} stroke={2} />
          </button>

          {/* Aceptar */}
          <button
            type="button"
            onClick={() => void acceptCall()}
            aria-label="Aceptar llamada"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform hover:scale-105 active:scale-95 animate-pulse"
          >
            {isVideo ? <IconVideo size={26} stroke={2} /> : <IconPhone size={26} stroke={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}
