import * as yup from "yup";
import { CallType } from "@prisma/client";

export const initiateCallSchema = yup.object({
  conversationId: yup.string().uuid("ID de conversación inválido").required("ID de conversación requerido"),
  receiverId: yup.string().uuid("ID de receptor inválido").required("ID de receptor requerido"),
  type: yup.string().oneOf([CallType.AUDIO, CallType.VIDEO]).default(CallType.AUDIO),
});

export const acceptCallSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
});

export const rejectCallSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
  reason: yup.string().oneOf(["declined", "busy"]).optional().default("declined"),
});

export const signalSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
  targetUserId: yup.string().uuid("ID de usuario destino inválido").required("ID de usuario destino requerido"),
  signal: yup.mixed().required("Señal WebRTC requerida"),
});

export const endCallSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
});
