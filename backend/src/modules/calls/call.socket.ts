import { ValidationError } from "yup";
import { SOCKET_LIFECYCLE_EVENTS } from "../../socket/events";
import { withRequestContext } from "../../socket/request-context";
import { userRoomName } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";
import { getLogger } from "../../config/request-context";
import { AppError } from "../../utils/errors";
import * as CallRepository from "./call.repository";
import * as CallService from "./call.service";
import {
  acceptCallSchema,
  endCallSchema,
  initiateCallSchema,
  rejectCallSchema,
  signalSchema,
} from "./call.validator";

export const CALL_EVENTS = {
  INITIATE: "call:initiate",
  OUTGOING: "call:outgoing",
  INCOMING: "call:incoming",
  ACCEPT: "call:accept",
  ACCEPTED: "call:accepted",
  REJECT: "call:reject",
  REJECTED: "call:rejected",
  BUSY: "call:busy",
  SIGNAL: "call:signal",
  END: "call:end",
  ENDED: "call:ended",
  ERROR: "call:error",
} as const;

/// Mensaje que se le devuelve al cliente cuando un handler falla. Solo los
/// errores pensados para mostrarse (`AppError`, validación de yup) conservan su
/// texto: cualquier otro (un error de Prisma trae tabla, columnas y constraint)
/// se reemplaza por `fallback`. El error completo sigue yendo al log.
function toClientMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError || err instanceof ValidationError) {
    return err.message || fallback;
  }
  return fallback;
}

export function registerCallSocket(socket: AppSocket, io: AppServer): void {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) return;
  const currentUserId = user.internalUserId;

  // 1. Iniciar llamada
  socket.on(
    CALL_EVENTS.INITIATE,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await initiateCallSchema.validate(rawPayload);
        const { call, isBusy } = await CallService.initiateCall(currentUserId, validated as any);

        if (isBusy) {
          socket.emit(CALL_EVENTS.BUSY, {
            call,
            receiverId: validated.receiverId,
            reason: "busy",
          });
          callback?.({ ok: false, isBusy: true });
          return;
        }

        if (call) {
          // Confirmar al emisor que la llamada está saliendo
          socket.emit(CALL_EVENTS.OUTGOING, { call });
          // Notificar al receptor que tiene llamada entrante
          io.to(userRoomName(validated.receiverId)).emit(CALL_EVENTS.INCOMING, { call });
          callback?.({ ok: true, call });
        }
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al iniciar llamada");
        const message = toClientMessage(err, "Error al iniciar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 2. Aceptar llamada
  socket.on(
    CALL_EVENTS.ACCEPT,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await acceptCallSchema.validate(rawPayload);
        const call = await CallService.acceptCall(currentUserId, validated.callId);

        // Notificar tanto al llamante como al receptor
        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.ACCEPTED, { call });
        io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.ACCEPTED, { call });
        callback?.({ ok: true, call });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al aceptar llamada");
        const message = toClientMessage(err, "Error al aceptar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 3. Rechazar llamada
  socket.on(
    CALL_EVENTS.REJECT,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await rejectCallSchema.validate(rawPayload);
        const call = await CallService.rejectCall(
          currentUserId,
          validated.callId,
          (validated.reason as any) || "declined",
        );

        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.REJECTED, {
          call,
          reason: validated.reason,
        });
        io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.REJECTED, {
          call,
          reason: validated.reason,
        });
        callback?.({ ok: true, call });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al rechazar llamada");
        const message = toClientMessage(err, "Error al rechazar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 4. Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on(
    CALL_EVENTS.SIGNAL,
    withRequestContext(socket, async (rawPayload: unknown) => {
      try {
        const validated = await signalSchema.validate(rawPayload);
        // El destino lo decide el servidor (el otro participante de una llamada
        // en curso), no el cliente: ver `CallService.authorizeSignal`.
        const peerId = await CallService.authorizeSignal(
          currentUserId,
          validated.callId,
          validated.targetUserId,
        );
        io.to(userRoomName(peerId)).emit(CALL_EVENTS.SIGNAL, {
          callId: validated.callId,
          senderUserId: currentUserId,
          signal: validated.signal,
        });
      } catch (err) {
        // Se descarta en silencio, sin `call:error`: una señal rechazada no es algo
        // que el cliente deba poder usar para sondear llamadas. No se loguea `err`
        // completo: el ValidationError de yup lleva el payload, y una SDP/ICE
        // trae las IPs de los dos extremos (LOGGING_PLAN §4).
        getLogger().warn(
          { userId: currentUserId, reason: err instanceof Error ? err.message : "unknown" },
          "Señal WebRTC descartada",
        );
      }
    }),
  );

  // 5. Finalizar llamada
  socket.on(
    CALL_EVENTS.END,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await endCallSchema.validate(rawPayload);
        const call = await CallService.endCall(currentUserId, validated.callId);

        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.ENDED, { call });
        io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.ENDED, { call });
        callback?.({ ok: true, call });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al finalizar llamada");
        const message = toClientMessage(err, "Error al finalizar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 6. Si el usuario se desconecta imprevistamente durante una llamada activa
  socket.on(
    SOCKET_LIFECYCLE_EVENTS.DISCONNECTING,
    withRequestContext(socket, async () => {
      try {
        const activeCall = await CallRepository.findActiveCallForUser(currentUserId);
        if (activeCall) {
          const ended = await CallService.endCall(currentUserId, activeCall.id);
          const targetUserId =
            activeCall.callerId === currentUserId ? activeCall.receiverId : activeCall.callerId;
          io.to(userRoomName(targetUserId)).emit(CALL_EVENTS.ENDED, { call: ended });
        }
      } catch (err) {
        getLogger().warn({ err, userId: currentUserId }, "Error limpiando llamada tras desconexión");
      }
    }),
  );
}
