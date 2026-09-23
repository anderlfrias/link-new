import { SOCKET_LIFECYCLE_EVENTS } from "../../socket/events";
import { withRequestContext } from "../../socket/request-context";
import { userRoomName } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";
import { getLogger } from "../../config/request-context";
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
        socket.emit(CALL_EVENTS.ERROR, { message: err?.message || "Error al iniciar llamada" });
        callback?.({ ok: false, error: err?.message });
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
        socket.emit(CALL_EVENTS.ERROR, { message: err?.message || "Error al aceptar llamada" });
        callback?.({ ok: false, error: err?.message });
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
        socket.emit(CALL_EVENTS.ERROR, { message: err?.message || "Error al rechazar llamada" });
        callback?.({ ok: false, error: err?.message });
      }
    }),
  );

  // 4. Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on(
    CALL_EVENTS.SIGNAL,
    withRequestContext(socket, async (rawPayload: unknown) => {
      try {
        const validated = await signalSchema.validate(rawPayload);
        // Retransmitir señal directamente a la sala del usuario destino
        io.to(userRoomName(validated.targetUserId)).emit(CALL_EVENTS.SIGNAL, {
          callId: validated.callId,
          senderUserId: currentUserId,
          signal: validated.signal,
        });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error en señalización WebRTC");
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
        socket.emit(CALL_EVENTS.ERROR, { message: err?.message || "Error al finalizar llamada" });
        callback?.({ ok: false, error: err?.message });
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
