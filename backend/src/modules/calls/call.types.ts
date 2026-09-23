import { CallStatus, CallType } from "@prisma/client";

export { CallStatus, CallType };

export interface CallResponse {
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

export interface InitiateCallInput {
  conversationId: string;
  receiverId: string;
  type: CallType;
}

export interface AcceptCallInput {
  callId: string;
}

export interface RejectCallInput {
  callId: string;
  reason?: "declined" | "busy";
}

export interface SignalInput {
  callId: string;
  targetUserId: string;
  signal: unknown;
}

export interface EndCallInput {
  callId: string;
}
