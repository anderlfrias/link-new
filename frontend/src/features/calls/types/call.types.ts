export type CallType = "AUDIO" | "VIDEO";

export type CallStatus = "RINGING" | "ACCEPTED" | "REJECTED" | "MISSED" | "COMPLETED" | "BUSY";

export type CallState = "idle" | "outgoing" | "incoming" | "connected" | "ended";

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
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  startCall: (conversationId: string, receiverId: string, receiverName: string, type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: "declined" | "busy") => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
}
