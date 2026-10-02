export type CallType = "AUDIO" | "VIDEO";

export type CallStatus = "RINGING" | "ACCEPTED" | "REJECTED" | "MISSED" | "COMPLETED" | "BUSY";

/**
 * - outgoing/incoming: la llamada está sonando (todavía no la aceptó el receptor).
 * - connecting: el receptor aceptó (`call:accepted`) y WebRTC está negociando.
 * - connected: `RTCPeerConnection.connectionState === "connected"` (hay media fluyendo).
 */
export type CallState = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "ended";

/** Errores de llamada que la UI debe mostrar al usuario. */
export type CallError = "media" | "insecure" | "connection";

export interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  callerName?: string;
  receiverId: string;
  receiverName?: string;
  type: CallType;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number;
}

export interface CallContextValue {
  callState: CallState;
  activeCall: Call | null;
  /** Nombre del OTRO participante (si soy el llamante, el receptor; si soy el receptor, el llamante). */
  peerName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  callError: CallError | null;
  clearCallError: () => void;
  startCall: (conversationId: string, receiverId: string, receiverName: string, type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: "declined" | "busy") => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
}
