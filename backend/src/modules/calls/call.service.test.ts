import { CallStatus, CallType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as AuditService from "../audit/audit.service";
import * as ConversationService from "../conversations/conversation.service";
import * as MessageService from "../messages/message.service";
import * as PushService from "../push/push.service";
import * as CallRepository from "./call.repository";
import {
  acceptCall,
  authorizeSignal,
  endCall,
  formatDuration,
  initiateCall,
  rejectCall,
  toCallResponse,
} from "./call.service";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));
vi.mock("./call.repository");
vi.mock("../conversations/conversation.service");
vi.mock("../audit/audit.service");
vi.mock("../messages/message.service");
vi.mock("../push/push.service");

describe("call.service", () => {
  const callerId = "user-caller-1";
  const receiverId = "user-receiver-2";
  const conversationId = "conv-1";
  const callId = "call-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatDuration", () => {
    it("formatea correctamente segundos a mm:ss", () => {
      expect(formatDuration(0)).toBe("00:00");
      expect(formatDuration(9)).toBe("00:09");
      expect(formatDuration(65)).toBe("01:05");
      expect(formatDuration(360)).toBe("06:00");
    });
  });

  describe("toCallResponse", () => {
    it("convierte modelo de base de datos a respuesta serializable", () => {
      const now = new Date("2026-09-23T12:00:00.000Z");
      const res = toCallResponse({
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: now,
        answeredAt: null,
        endedAt: null,
        duration: 0,
        caller: { name: "Llamante" },
        receiver: { name: "Receptor" },
      });

      expect(res.id).toBe(callId);
      expect(res.callerName).toBe("Llamante");
      expect(res.receiverName).toBe("Receptor");
      expect(res.startedAt).toBe(now.toISOString());
      expect(res.answeredAt).toBeNull();
    });
  });

  describe("initiateCall", () => {
    it("inicia una llamada correctamente si ambos usuarios están disponibles", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValue(null);

      const mockCall = {
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        duration: 0,
        caller: { name: "Llamante" },
        receiver: { name: "Receptor" },
      };
      vi.mocked(CallRepository.createCall).mockResolvedValue(mockCall as any);

      const result = await initiateCall(callerId, {
        conversationId,
        receiverId,
        type: CallType.AUDIO,
      });

      expect(result.isBusy).toBe(false);
      expect(result.call?.id).toBe(callId);
      expect(CallRepository.createCall).toHaveBeenCalledWith({
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
      });
      expect(AuditService.record).toHaveBeenCalled();
      expect(PushService.notifyUsers).toHaveBeenCalledWith(
        [receiverId],
        expect.objectContaining({
          title: "Llamante",
          body: "Llamada de voz entrante",
          tag: `call-${callId}`,
          kind: "call",
        }),
      );
    });

    it("un fallo del push no impide iniciar la llamada", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);
      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValue(null);
      vi.mocked(CallRepository.createCall).mockResolvedValue({
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.VIDEO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        caller: { name: "Llamante" },
      } as any);
      vi.mocked(PushService.notifyUsers).mockRejectedValue(new Error("push down"));

      const result = await initiateCall(callerId, { conversationId, receiverId, type: CallType.VIDEO });
      expect(result.isBusy).toBe(false);
      expect(PushService.notifyUsers).toHaveBeenCalledWith(
        [receiverId],
        expect.objectContaining({ body: "Videollamada entrante" }),
      );
    });

    it("lanza BadRequestError si el receptor no es miembro de la conversación", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }],
      } as any);

      await expect(
        initiateCall(callerId, {
          conversationId,
          receiverId,
          type: CallType.AUDIO,
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("lanza BadRequestError si el llamante ya tiene una llamada activa", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValueOnce({ id: "active-call" } as any);

      await expect(
        initiateCall(callerId, {
          conversationId,
          receiverId,
          type: CallType.AUDIO,
        }),
      ).rejects.toThrow(/Ya te encuentras en una llamada activa/);
    });

    it("retorna isBusy=true y crea mensaje de ocupado si el receptor está en llamada", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      // Caller libre
      vi.mocked(CallRepository.findActiveCallForUser)
        .mockResolvedValueOnce(null)
        // Receiver ocupado
        .mockResolvedValueOnce({ id: "call-other" } as any);

      vi.mocked(CallRepository.createCall).mockResolvedValue({ id: "busy-call-id" } as any);
      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: "busy-call-id",
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.BUSY,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await initiateCall(callerId, {
        conversationId,
        receiverId,
        type: CallType.AUDIO,
      });

      expect(result.isBusy).toBe(true);
      expect(PushService.notifyUsers).not.toHaveBeenCalled();
      expect(MessageService.sendMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.objectContaining({
          content: expect.stringContaining("ocupado"),
          type: "CALL",
        }),
      );
    });
  });

  describe("acceptCall", () => {
    it("permite al receptor aceptar la llamada", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.ACCEPTED,
        startedAt: new Date(),
        answeredAt: new Date(),
      } as any);

      const accepted = await acceptCall(receiverId, callId);
      expect(accepted.status).toBe(CallStatus.ACCEPTED);
      expect(CallRepository.updateCallStatus).toHaveBeenCalledWith(
        callId,
        CallStatus.ACCEPTED,
        expect.objectContaining({ answeredAt: expect.any(Date) }),
      );
    });

    it("lanza ForbiddenError si quien intenta aceptar no es el receptor", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
      } as any);

      await expect(acceptCall("impostor", callId)).rejects.toThrow(ForbiddenError);
    });

    it("lanza BadRequestError si la llamada no está en estado RINGING", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.COMPLETED,
      } as any);

      await expect(acceptCall(receiverId, callId)).rejects.toThrow(BadRequestError);
    });
  });

  describe("rejectCall", () => {
    it("marca llamada como perdida si cancela el llamante antes de ser atendida", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.MISSED,
        startedAt: new Date(),
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await rejectCall(callerId, callId);
      expect(result.status).toBe(CallStatus.MISSED);
      expect(MessageService.sendMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.objectContaining({
          content: "📞 Llamada de voz perdida",
          type: "CALL",
        }),
      );
    });

    it("marca llamada como rechazada si cancela el receptor", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.VIDEO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.VIDEO,
        status: CallStatus.REJECTED,
        startedAt: new Date(),
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await rejectCall(receiverId, callId, "declined");
      expect(result.status).toBe(CallStatus.REJECTED);
      expect(MessageService.sendMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.objectContaining({
          content: "📹 Videollamada rechazada",
          type: "CALL",
        }),
      );
    });
  });

  describe("authorizeSignal", () => {
    function mockCall(status: CallStatus) {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status,
      } as any);
    }

    it("devuelve al receptor cuando señaliza el llamante", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal(callerId, callId, receiverId)).resolves.toBe(receiverId);
    });

    it("devuelve al llamante cuando señaliza el receptor", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal(receiverId, callId, callerId)).resolves.toBe(callerId);
    });

    it("admite señales mientras la llamada todavía suena (RINGING)", async () => {
      mockCall(CallStatus.RINGING);

      await expect(authorizeSignal(callerId, callId, receiverId)).resolves.toBe(receiverId);
    });

    it("rechaza si el emisor no participa de la llamada", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal("user-intruso", callId, receiverId)).rejects.toThrow(ForbiddenError);
    });

    it("rechaza si targetUserId no es el otro participante", async () => {
      mockCall(CallStatus.ACCEPTED);

      // Ni un tercero cualquiera ni el propio emisor son destinos válidos.
      await expect(authorizeSignal(callerId, callId, "user-tercero")).rejects.toThrow(ForbiddenError);
      await expect(authorizeSignal(callerId, callId, callerId)).rejects.toThrow(ForbiddenError);
    });

    it.each([CallStatus.COMPLETED, CallStatus.REJECTED, CallStatus.MISSED, CallStatus.BUSY])(
      "rechaza si la llamada ya terminó (%s)",
      async (status) => {
        mockCall(status);

        await expect(authorizeSignal(callerId, callId, receiverId)).rejects.toThrow(BadRequestError);
      },
    );

    it("NotFound si la llamada no existe", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue(null);

      await expect(authorizeSignal(callerId, callId, receiverId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("endCall", () => {
    it("calcula duración y finaliza llamada activa", async () => {
      const started = new Date(Date.now() - 75000); // 75 segs atrás
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.ACCEPTED,
        startedAt: started,
        answeredAt: started,
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.COMPLETED,
        startedAt: started,
        answeredAt: started,
        endedAt: new Date(),
        duration: 75,
      } as any);

      const res = await endCall(callerId, callId);
      expect(res.status).toBe(CallStatus.COMPLETED);
      expect(MessageService.sendMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.objectContaining({
          content: expect.stringMatching(/📞 Llamada de voz finalizada \(01:15\)/),
          type: "CALL",
        }),
      );
      expect(AuditService.record).toHaveBeenCalled();
    });
  });
});
