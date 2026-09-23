"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/providers/socket-provider";
import { useAuth } from "@/providers/auth-provider";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import {
  Call,
  CallContextValue,
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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  // Limpieza total de conexión y medios
  const cleanupMediaAndPeer = useCallback(() => {
    stopAllTones();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    pendingCandidates.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
  }, []);

  // Inicializar o crear RTCPeerConnection
  const getOrCreatePeerConnection = useCallback((targetUserId: string, callId: string) => {
    if (pcRef.current && pcRef.current.signalingState !== "closed") {
      return pcRef.current;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Agregar tracks locales
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Recibir tracks remotos
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
      }
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
  }, [socket]);

  // Manejo de finalización
  const handleCallEndedLocally = useCallback(() => {
    cleanupMediaAndPeer();
    setCallState("idle");
    setActiveCall(null);
  }, [cleanupMediaAndPeer]);

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
              cleanupMediaAndPeer();
              setCallState("idle");
              setActiveCall(null);
            } else if (res.call) {
              setActiveCall({ ...res.call, receiverName });
            }
          },
        );
      } catch (err) {
        stopAllTones();
        cleanupMediaAndPeer();
        setCallState("idle");
        setActiveCall(null);
      }
    },
    [socket, currentUserId, callState, cleanupMediaAndPeer],
  );

  // 2. Aceptar llamada entrante
  const acceptCall = useCallback(async () => {
    if (!socket || !activeCall) return;

    try {
      stopAllTones();

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
          setActiveCall(res.call);
          setCallState("connected");
        } else {
          handleCallEndedLocally();
        }
      });
    } catch (err) {
      handleCallEndedLocally();
    }
  }, [socket, activeCall, getOrCreatePeerConnection, handleCallEndedLocally]);

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
      setActiveCall(payload.call);
      setCallState("incoming");
      playIncomingRingtone();
    };

    // Llamada saliente aceptada por el otro peer
    const handleAccepted = async (payload: { call: Call }) => {
      stopAllTones();
      setActiveCall(payload.call);
      setCallState("connected");

      // Si somos el llamante, creamos la oferta WebRTC
      if (payload.call.callerId === currentUserId) {
        const pc = getOrCreatePeerConnection(payload.call.receiverId, payload.call.id);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit(SOCKET_EVENTS.call.signal, {
            callId: payload.call.id,
            targetUserId: payload.call.receiverId,
            signal: offer,
          });
        } catch {
          // error
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
      if (!pcRef.current) {
        getOrCreatePeerConnection(payload.senderUserId, payload.callId);
      }
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (payload.signal.type === "offer") {
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
        } else if (payload.signal.type === "answer") {
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
      } catch {
        // error handling signal
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
  }, [socket, callState, currentUserId, getOrCreatePeerConnection, handleCallEndedLocally]);

  const value: CallContextValue = {
    callState,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
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
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  callDuration: 0,
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
