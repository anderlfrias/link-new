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

/// Una oferta SDP con video ronda unos pocos KiB. Sin tope, el único límite es el
/// `maxHttpBufferSize` de Socket.IO (1 MB por mensaje).
export const MAX_SIGNAL_BYTES = 64 * 1024;

function isSignalSizeAllowed(signal: unknown): boolean {
  try {
    return (JSON.stringify(signal) ?? "").length <= MAX_SIGNAL_BYTES;
  } catch {
    return false;
  }
}

export const signalSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
  targetUserId: yup.string().uuid("ID de usuario destino inválido").required("ID de usuario destino requerido"),
  signal: yup
    .mixed()
    .required("Señal WebRTC requerida")
    .test("signal-size", "Señal WebRTC demasiado grande", isSignalSizeAllowed),
});

export const endCallSchema = yup.object({
  callId: yup.string().uuid("ID de llamada inválido").required("ID de llamada requerido"),
});
