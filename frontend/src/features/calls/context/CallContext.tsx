"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/providers/auth-provider";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import {
  Call,
  CallContextValue,
  CallError,
  CallState,
  CallType,
} from "../types/call.types";
import {
  playEndCallTone,
  playIncomingRingtone,
  playOutgoingRingtone,
  stopAllTones,
} from "../utils/call-tones";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

/**
 * Traza del ciclo de vida de una llamada (solo transiciones relevantes, no por-candidato).
 * Secuencia esperada: accepted → pc created → offer created → answer received →
 * ice connecting → webrtc connected.
 */
function callLog(step: string, detail?: Record<string, unknown>) {
  console.debug(`[call] ${step}`, detail ?? "");
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { session } = useAuth();
  const currentUserId = session?.user?.internalUserId;

  const [callState, setCallState] = useState<CallState>("idle");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callError, setCallError] = useState<CallError | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  // Copia síncrona de activeCall: los handlers de socket/WebRTC no pueden esperar a un re-render.
  const activeCallRef = useRef<Call | null>(null);

  const updateActiveCall = useCallback((call: Call | null) => {
    activeCallRef.current = call;
    setActiveCall(call);
  }, []);

  const clearCallError = useCallback(() => setCallError(null), []);

  // Limpieza total de conexión y medios
  const cleanupMediaAndPeer = useCallback(() => {
    stopAllTones();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (pcRef.current) {
      const pc = pcRef.current;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onicecandidateerror = null;
      pc.onsignalingstatechange = null;
      pc.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    pendingCandidates.current = [];
    activeCallRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
  }, []);

  // Manejo de finalización
  const handleCallEndedLocally = useCallback(() => {
    cleanupMediaAndPeer();
    setCallState("idle");
    updateActiveCall(null);
  }, [cleanupMediaAndPeer, updateActiveCall]);

  // Falla irrecuperable de la llamada: avisa al otro participante (call:end), limpia y muestra el error.
  const failCall = useCallback(
    (reason: CallError, detail: string, callId?: string) => {
      callLog("call failed", { reason, detail, callId });
      if (callId && socket) socket.emit(SOCKET_EVENTS.call.end, { callId });
      playEndCallTone();
      handleCallEndedLocally();
      setCallError(reason);
    },
    [socket, handleCallEndedLocally],
  );

  // Inicializar o crear RTCPeerConnection
  const getOrCreatePeerConnection = useCallback((targetUserId: string, callId: string) => {
    if (pcRef.current && pcRef.current.signalingState !== "closed") {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    callLog("pc created", { callId });

    // Agregar tracks locales
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Recibir tracks remotos
    pc.ontrack = (event) => {
      if (pcRef.current !== pc) return;
      const [stream] = event.streams;
      if (stream) {
        callLog("remote track", { kind: event.track.kind });
        setRemoteStream(stream);
      }
    };

    // Estados reales de WebRTC (los handlers ignoran eventos de un PC ya descartado)
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      callLog(`pc connectionState=${pc.connectionState}`, { iceConnectionState: pc.iceConnectionState });
      switch (pc.connectionState) {
        case "connected":
          callLog("webrtc connected", { callId });
          // Solo promueve llamadas en curso; no resucita una llamada ya cerrada
          setCallState((prev) => (prev === "connecting" || prev === "outgoing" ? "connected" : prev));
          break;
        case "failed":
          failCall("connection", "RTCPeerConnection failed", callId);
          break;
        case "closed":
          handleCallEndedLocally();
          break;
        // new / connecting: negociación en curso. disconnected: puede recuperarse solo;
        // si no, el navegador pasa a "failed" y se maneja arriba.
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      callLog(`ice connectionState=${pc.iceConnectionState}`);
    };
    pc.onicegatheringstatechange = () => {
      if (pcRef.current !== pc) return;
      callLog(`ice gatheringState=${pc.iceGatheringState}`);
    };
    pc.onsignalingstatechange = () => {
      if (pcRef.current !== pc) return;
      callLog(`signalingState=${pc.signalingState}`);
    };
    pc.onicecandidateerror = (event) => {
      const e = event as RTCPeerConnectionIceErrorEvent;
      console.warn("[call] ice candidate error", { code: e.errorCode, text: e.errorText, url: e.url });
    };

    // Candidatos ICE hacia el otro peer
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit(SOCKET_EVENTS.call.signal, {
          callId,
          targetUserId,
          signal: event.candidate.toJSON(),
        });
      }
    };

    return pc;
  }, [socket, failCall, handleCallEndedLocally]);

  // Temporizador de duración
  useEffect(() => {
    if (callState === "connected") {
      setCallDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [callState]);

  // 1. Iniciar llamada saliente
  const startCall = useCallback(
    async (conversationId: string, receiverId: string, receiverName: string, type: CallType) => {
      if (!socket || !currentUserId) return;
      if (callState !== "idle") return;

      setCallError(null);
      try {
        // Pedir permisos de audio y video
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === "VIDEO",
        });
        localStreamRef.current = stream;
        setLocalStream(stream);

        playOutgoingRingtone();
        setCallState("outgoing");

        socket.emit(
          SOCKET_EVENTS.call.initiate,
          { conversationId, receiverId, type },
          (res: { ok: boolean; call?: Call; isBusy?: boolean; error?: string }) => {
            if (!res?.ok) {
              stopAllTones();
              playEndCallTone();
              handleCallEndedLocally();
            } else if (res.call) {
              updateActiveCall({ ...res.call, receiverName });
            }
          },
        );
      } catch (err) {
        // Todavia no existe la llamada en el backend: no hay a quien avisar, solo informar al usuario.
        console.warn("[call] getUserMedia failed (caller)", err);
        handleCallEndedLocally();
        setCallError(navigator.mediaDevices ? "media" : "insecure");
      }
    },
    [socket, currentUserId, callState, handleCallEndedLocally, updateActiveCall],
  );

  // 2. Aceptar llamada entrante
  const acceptCall = useCallback(async () => {
    if (!socket || !activeCall) return;

    try {
      stopAllTones();
      setCallError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: activeCall.type === "VIDEO",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Crear PeerConnection
      getOrCreatePeerConnection(activeCall.callerId, activeCall.id);

      socket.emit(SOCKET_EVENTS.call.accept, { callId: activeCall.id }, (res: { ok: boolean; call?: Call }) => {
        if (res?.ok && res.call) {
          callLog("accept acked", { callId: res.call.id });
          updateActiveCall(res.call);
          // "Aceptada" no es "conectada": WebRTC promueve a "connected" cuando el PC lo confirme.
          setCallState((prev) => (prev === "connected" ? prev : "connecting"));
        } else {
          handleCallEndedLocally();
        }
      });
    } catch (err) {
      // La llamada sigue en RINGING en el backend: se rechaza para que el llamante no quede esperando.
      // (El contrato solo admite "declined"/"busy"; no distingue error de medios.)
      console.warn("[call] getUserMedia failed (callee)", err);
      socket.emit(SOCKET_EVENTS.call.reject, { callId: activeCall.id, reason: "declined" });
      playEndCallTone();
      handleCallEndedLocally();
      setCallError(navigator.mediaDevices ? "media" : "insecure");
    }
  }, [socket, activeCall, getOrCreatePeerConnection, handleCallEndedLocally, updateActiveCall]);

  // 3. Rechazar llamada
  const rejectCall = useCallback(
    async (reason: "declined" | "busy" = "declined") => {
      if (!socket || !activeCall) return;
      socket.emit(SOCKET_EVENTS.call.reject, { callId: activeCall.id, reason });
      playEndCallTone();
      handleCallEndedLocally();
    },
    [socket, activeCall, handleCallEndedLocally],
  );

  // 4. Finalizar llamada en curso
  const endCall = useCallback(async () => {
    if (!socket || !activeCall) return;
    socket.emit(SOCKET_EVENTS.call.end, { callId: activeCall.id });
    playEndCallTone();
    handleCallEndedLocally();
  }, [socket, activeCall, handleCallEndedLocally]);

  // 5. Controles de medios
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, []);

  // Listeners de sockets de llamada
  useEffect(() => {
    if (!socket) return;

    // Llamada entrante
    const handleIncoming = (payload: { call: Call }) => {
      if (callState !== "idle") {
        // Si ya estamos en otra llamada, emitir ocupado
        socket.emit(SOCKET_EVENTS.call.reject, { callId: payload.call.id, reason: "busy" });
        return;
      }
      updateActiveCall(payload.call);
      setCallState("incoming");
      playIncomingRingtone();
    };

    // Llamada saliente aceptada por el otro peer
    const handleAccepted = async (payload: { call: Call }) => {
      callLog("call accepted", { callId: payload.call.id });
      stopAllTones();
      updateActiveCall(payload.call);
      // Aceptada por el receptor, pero WebRTC aun no negocio: "connected" lo decide el PC.
      setCallState((prev) => (prev === "connected" ? prev : "connecting"));

      // Si somos el llamante, creamos la oferta WebRTC
      if (payload.call.callerId === currentUserId) {
        const pc = getOrCreatePeerConnection(payload.call.receiverId, payload.call.id);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          callLog("offer created", { callId: payload.call.id });
          socket.emit(SOCKET_EVENTS.call.signal, {
            callId: payload.call.id,
            targetUserId: payload.call.receiverId,
            signal: offer,
          });
        } catch (err) {
          console.warn("[call] createOffer failed", err);
          if (pcRef.current === pc) failCall("connection", "createOffer failed", payload.call.id);
        }
      }
    };

    // Llamada rechazada u ocupada
    const handleRejected = () => {
      playEndCallTone();
      handleCallEndedLocally();
    };

    const handleBusy = () => {
      playEndCallTone();
      handleCallEndedLocally();
    };

    // Llamada terminada
    const handleEnded = () => {
      playEndCallTone();
      handleCallEndedLocally();
    };

    // Señalización WebRTC
    const handleSignal = async (payload: {
      callId: string;
      senderUserId: string;
      signal: RTCSessionDescriptionInit | RTCIceCandidateInit | any;
    }) => {
      // Senales de una llamada que ya termino (o ajena) no deben crear un PC nuevo
      if (!activeCallRef.current || activeCallRef.current.id !== payload.callId) return;
      if (!pcRef.current) {
        getOrCreatePeerConnection(payload.senderUserId, payload.callId);
      }
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (payload.signal.type === "offer") {
          callLog("offer received", { callId: payload.callId });
          await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          // Procesar candidatos pendientes
          while (pendingCandidates.current.length > 0) {
            const cand = pendingCandidates.current.shift();
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit(SOCKET_EVENTS.call.signal, {
            callId: payload.callId,
            targetUserId: payload.senderUserId,
            signal: answer,
          });
          callLog("answer created", { callId: payload.callId });
        } else if (payload.signal.type === "answer") {
          callLog("answer received", { callId: payload.callId });
          await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          while (pendingCandidates.current.length > 0) {
            const cand = pendingCandidates.current.shift();
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        } else if (payload.signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.signal));
          } else {
            pendingCandidates.current.push(payload.signal);
          }
        }
      } catch (err) {
        console.warn("[call] signal handling failed", err);
        // Un fallo de SDP deja la negociacion irrecuperable; un candidato ICE invalido no.
        if (payload.signal.type === "offer" || payload.signal.type === "answer") {
          if (pcRef.current === pc) failCall("connection", "SDP negotiation failed", payload.callId);
        }
      }
    };

    socket.on(SOCKET_EVENTS.call.incoming, handleIncoming);
    socket.on(SOCKET_EVENTS.call.accepted, handleAccepted);
    socket.on(SOCKET_EVENTS.call.rejected, handleRejected);
    socket.on(SOCKET_EVENTS.call.busy, handleBusy);
    socket.on(SOCKET_EVENTS.call.ended, handleEnded);
    socket.on(SOCKET_EVENTS.call.signal, handleSignal);

    return () => {
      socket.off(SOCKET_EVENTS.call.incoming, handleIncoming);
      socket.off(SOCKET_EVENTS.call.accepted, handleAccepted);
      socket.off(SOCKET_EVENTS.call.rejected, handleRejected);
      socket.off(SOCKET_EVENTS.call.busy, handleBusy);
      socket.off(SOCKET_EVENTS.call.ended, handleEnded);
      socket.off(SOCKET_EVENTS.call.signal, handleSignal);
    };
  }, [socket, callState, currentUserId, getOrCreatePeerConnection, handleCallEndedLocally, failCall, updateActiveCall]);

  const peerName = activeCall
    ? (activeCall.callerId === currentUserId ? activeCall.receiverName : activeCall.callerName) ?? null
    : null;

  const value: CallContextValue = {
    callState,
    activeCall,
    peerName,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
    callError,
    clearCallError,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

const defaultCallContext: CallContextValue = {
  callState: "idle",
  activeCall: null,
  peerName: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  callDuration: 0,
  callError: null,
  clearCallError: () => {},
  startCall: async () => {},
  acceptCall: async () => {},
  rejectCall: async () => {},
  endCall: async () => {},
  toggleMute: () => {},
  toggleVideo: () => {},
};

export function useCall(): CallContextValue {
  const context = useContext(CallContext);
  return context ?? defaultCallContext;
}
