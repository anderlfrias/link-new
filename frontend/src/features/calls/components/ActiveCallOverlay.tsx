"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconVolume,
  IconPhoneOff,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/i18n";
import { useCall } from "../hooks/use-call";
import { useAudioRoute } from "../hooks/use-audio-route";

const CALL_ERROR_KEYS = {
  media: "calls.mediaError",
  denied: "calls.permissionDenied",
  "in-use": "calls.deviceInUse",
  insecure: "calls.insecureContext",
  connection: "calls.connectionFailed",
} as const;

const MEDIA_WARNING_KEYS = {
  "no-mic": "calls.noMicWarning",
  "no-camera": "calls.noCameraWarning",
  "no-devices": "calls.noDevicesWarning",
} as const;

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ActiveCallOverlay() {
  const { t } = useTranslation();
  const {
    callState,
    activeCall,
    peerName: peerNameFromCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
    callError,
    clearCallError,
    mediaWarning,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const isVisible =
    callState === "outgoing" || callState === "connecting" || callState === "connected";
  const isVideo = activeCall?.type === "VIDEO";

  // El remoteStream se reproduce en UN solo elemento: <video> (que ya incluye el audio)
  // en videollamadas, <audio> en llamadas de voz. Nunca en ambos a la vez (eco/doble audio).
  const attachRemote = isVisible && !!activeCall && !!remoteStream;
  useEffect(() => {
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    const target = isVideo ? video : audio;
    const other = isVideo ? audio : video;
    if (other) other.srcObject = null;
    if (target && attachRemote) {
      target.srcObject = remoteStream;
      // autoPlay puede ser bloqueado por el navegador; la llamada fue iniciada por un gesto del usuario.
      void Promise.resolve(target.play?.()).catch(() => {});
    }
    return () => {
      if (target) target.srcObject = null;
    };
  }, [remoteStream, attachRemote, isVideo]);

  // Conectar localStream al video local (siempre muted: es el propio micrófono)
  useEffect(() => {
    const video = localVideoRef.current;
    if (localStream && video) {
      video.srcObject = localStream;
    }
    return () => {
      if (video) video.srcObject = null;
    };
  }, [localStream, isVideo, isVisible]);

  const getRemoteElement = useCallback(
    () => (isVideo ? remoteVideoRef.current : remoteAudioRef.current),
    [isVideo],
  );
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const audioRoute = useAudioRoute({
    active: attachRemote,
    isVideoCall: !!isVideo,
    getElement: getRemoteElement,
    streamKey: remoteStream,
  });

  if (!isVisible || !activeCall) {
    if (!callError) return null;
    return (
      <div
        role="alert"
        className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-red-600 px-4 py-3 text-sm text-white shadow-xl"
      >
        <span>
          {t(CALL_ERROR_KEYS[callError])}
        </span>
        <button type="button" onClick={clearCallError} className="font-semibold underline">
          OK
        </button>
      </div>
    );
  }

  const peerName = peerNameFromCall || "Contacto";
  const isConnected = callState === "connected";
  const isConnecting = callState === "connecting";
  const micMissing = mediaWarning === "no-mic" || mediaWarning === "no-devices";
  const cameraMissing = mediaWarning === "no-camera" || mediaWarning === "no-devices";

  return (
    <div
      role="dialog"
      aria-label={isVideo ? t("calls.activeVideoCallAria") : t("calls.activeAudioCallAria")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-neutral-950/95 p-6 text-white backdrop-blur-md animate-in fade-in"
    >
      {/* Audio oculto: solo en llamadas de voz (en video el audio sale del <video> remoto) */}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay />}

      {/* Barra superior con información */}
      <div className="flex w-full max-w-2xl items-center justify-between z-20">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">{peerName}</h2>
          <p className="text-sm font-medium text-neutral-400">
            {isConnected
              ? formatSeconds(callDuration)
              : isConnecting
                ? t("calls.connecting")
                : t("calls.calling")}
          </p>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-neutral-300">
          {isVideo ? t("calls.videoCallBadge") : t("calls.audioCallBadge")}
        </div>
      </div>

      {mediaWarning && (
        <p role="status" className="z-20 w-full max-w-2xl rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
          {t(MEDIA_WARNING_KEYS[mediaWarning])}
        </p>
      )}

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
              {isConnected ? "Llamada en curso" : isConnecting ? t("calls.connecting") : "Esperando respuesta..."}
            </p>
          </div>
        )}

        {/* Video local en miniatura (Picture in Picture) */}
        {isVideo && localStream && !cameraMissing && (
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
          disabled={micMissing}
          aria-label={isMuted ? t("calls.unmuteMic") : t("calls.muteMic")}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
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
            disabled={cameraMissing}
            aria-label={isVideoOff ? t("calls.turnOnCamera") : t("calls.turnOffCamera")}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              isVideoOff
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
            }`}
          >
            {isVideoOff ? <IconVideoOff size={22} /> : <IconVideo size={22} />}
          </button>
        )}

        {/* Salida de audio: auricular / altavoz / Bluetooth (solo celulares donde el navegador permite elegir) */}
        {audioRoute.available && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOutputMenuOpen((open) => !open)}
              aria-label={t("calls.audioOutput")}
              aria-haspopup="menu"
              aria-expanded={outputMenuOpen}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-all hover:bg-white/20"
            >
              <IconVolume size={22} />
            </button>
            {outputMenuOpen && (
              <div
                role="menu"
                aria-label={t("calls.audioOutput")}
                className="absolute bottom-14 left-1/2 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 text-sm shadow-2xl"
              >
                {audioRoute.devices.map((device) => {
                  const selected = device.id === audioRoute.selectedId;
                  return (
                    <button
                      key={device.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        audioRoute.select(device.id);
                        setOutputMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-white/10 ${
                        selected ? "font-semibold text-white" : "text-neutral-300"
                      }`}
                    >
                      <span className="truncate">
                        {device.kind === "earpiece"
                          ? t("calls.earpiece")
                          : device.kind === "speaker"
                            ? t("calls.speaker")
                            : device.label}
                      </span>
                      {selected && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Colgar / Finalizar llamada */}
        <button
          type="button"
          onClick={() => void endCall()}
          aria-label={t("calls.endCall")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-transform hover:scale-105 active:scale-95"
        >
          <IconPhoneOff size={26} stroke={2} />
        </button>
      </div>
    </div>
  );
}
