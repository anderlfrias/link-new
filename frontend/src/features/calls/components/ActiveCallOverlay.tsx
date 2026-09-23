"use client";

import React, { useEffect, useRef } from "react";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "../hooks/use-call";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ActiveCallOverlay() {
  const {
    callState,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const isVisible = callState === "outgoing" || callState === "connected";

  // Conectar remoteStream al video/audio
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream]);

  // Conectar localStream al video local
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!isVisible || !activeCall) {
    return null;
  }

  const isVideo = activeCall.type === "VIDEO";
  const peerName = activeCall.receiverName || activeCall.callerName || "Contacto";
  const isConnected = callState === "connected";

  return (
    <div
      role="dialog"
      aria-label={isVideo ? "Videollamada en curso" : "Llamada de voz en curso"}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-neutral-950/95 p-6 text-white backdrop-blur-md animate-in fade-in"
    >
      {/* Audio oculto para llamadas de voz */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Barra superior con información */}
      <div className="flex w-full max-w-2xl items-center justify-between z-20">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">{peerName}</h2>
          <p className="text-sm font-medium text-neutral-400">
            {isConnected ? formatSeconds(callDuration) : "Llamando..."}
          </p>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-neutral-300">
          {isVideo ? "Videollamada" : "Llamada de voz"}
        </div>
      </div>

      {/* Contenido Central: Video o Avatar */}
      <div className="relative flex flex-1 w-full max-w-4xl items-center justify-center overflow-hidden my-4 rounded-2xl bg-neutral-900 border border-white/10">
        {isVideo && remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover rounded-2xl"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <div className={`relative ${!isConnected ? "animate-pulse" : ""}`}>
              <Avatar name={peerName} size="xl" />
            </div>
            <p className="text-base text-neutral-300">
              {!isConnected ? "Esperando respuesta..." : "Llamada en curso"}
            </p>
          </div>
        )}

        {/* Video local en miniatura (Picture in Picture) */}
        {isVideo && localStream && (
          <div className="absolute bottom-4 right-4 h-36 w-24 sm:h-48 sm:w-32 overflow-hidden rounded-xl border-2 border-white/20 bg-neutral-950 shadow-2xl z-20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover -scale-x-100 ${isVideoOff ? "hidden" : "block"}`}
            />
            {isVideoOff && (
              <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-xs text-neutral-400">
                Cámara apagada
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Controles Inferior */}
      <div className="flex items-center justify-center gap-6 pb-4 z-20">
        {/* Silenciar micrófono */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? "Activar micrófono" : "Silenciar micrófono"}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
            isMuted
              ? "bg-red-500/20 text-red-400 border border-red-500/40"
              : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
          }`}
        >
          {isMuted ? <IconMicrophoneOff size={22} /> : <IconMicrophone size={22} />}
        </button>

        {/* Prender/Apagar cámara si es video */}
        {isVideo && (
          <button
            type="button"
            onClick={toggleVideo}
            aria-label={isVideoOff ? "Encender cámara" : "Apagar cámara"}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isVideoOff
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
            }`}
          >
            {isVideoOff ? <IconVideoOff size={22} /> : <IconVideo size={22} />}
          </button>
        )}

        {/* Colgar / Finalizar llamada */}
        <button
          type="button"
          onClick={() => void endCall()}
          aria-label="Finalizar llamada"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-transform hover:scale-105 active:scale-95"
        >
          <IconPhoneOff size={26} stroke={2} />
        </button>
      </div>
    </div>
  );
}
