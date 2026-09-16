import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditAction, ConversationType } from "@prisma/client";
import { runWithContext, getLogger } from "../../config/request-context";
import * as AuditRepository from "./audit.repository";
import * as AuditService from "./audit.service";

vi.mock("./audit.repository");

describe("AuditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildAuditData", () => {
    it("completa ip, userAgent, requestId y userId desde el contexto", () => {
      const mockMeta = {
        requestId: "req-123",
        actorUserId: "user-ctx-1",
        actorEmail: "actor@test.com",
        ip: "192.168.1.100",
        userAgent: "Mozilla/5.0",
      };

      const result = runWithContext(getLogger(), mockMeta, () => {
        return AuditService.buildAuditData({
          action: AuditAction.CREATE_CONVERSATION,
          metadata: { conversationType: ConversationType.PRIVATE },
        });
      });

      expect(result.action).toBe(AuditAction.CREATE_CONVERSATION);
      expect(result.userId).toBe("user-ctx-1");
      expect(result.actorEmail).toBe("actor@test.com");
      expect(result.ip).toBe("192.168.1.100");
      expect(result.userAgent).toBe("Mozilla/5.0");
      expect(result.requestId).toBe("req-123");
      expect(result.metadata).toEqual({ conversationType: ConversationType.PRIVATE });
    });

    it("un userId explícito gana sobre el del contexto", () => {
      const mockMeta = {
        requestId: "req-123",
        actorUserId: "user-ctx-1",
        actorEmail: "ctx@test.com",
      };

      const result = runWithContext(getLogger(), mockMeta, () => {
        return AuditService.buildAuditData({
          action: AuditAction.LOGIN,
          userId: "user-explicit-2",
          actorEmail: "explicit@test.com",
        });
      });

      expect(result.userId).toBe("user-explicit-2");
      expect(result.actorEmail).toBe("explicit@test.com");
    });

    it("userId: null explícito se respeta y no cae al del contexto", () => {
      const mockMeta = {
        requestId: "req-123",
        actorUserId: "user-ctx-1",
        actorEmail: "ctx@test.com",
      };

      const result = runWithContext(getLogger(), mockMeta, () => {
        return AuditService.buildAuditData({
          action: AuditAction.LOGIN_FAILED,
          userId: null,
          actorEmail: "attempted@test.com",
          metadata: { reason: "invalid_credentials" },
        });
      });

      expect(result.userId).toBeNull();
      expect(result.actorEmail).toBe("attempted@test.com");
    });

    it("fuera de todo contexto, no tira y deja campos contextuales vacíos/null", () => {
      const result = AuditService.buildAuditData({
        action: AuditAction.EDIT_MESSAGE,
      });

      expect(result.userId).toBeNull();
      expect(result.actorEmail).toBeNull();
      expect(result.ip).toBeUndefined();
      expect(result.userAgent).toBeUndefined();
      expect(result.requestId).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it("una acción con metadata: undefined declared (EDIT_MESSAGE) guarda metadata undefined", () => {
      const result = AuditService.buildAuditData({
        action: AuditAction.EDIT_MESSAGE,
        messageId: "msg-1",
      });

      expect(result.action).toBe(AuditAction.EDIT_MESSAGE);
      expect(result.messageId).toBe("msg-1");
      expect(result.metadata).toBeUndefined();
    });

    it("tipado estricto rechaza metadata inválido", () => {
      // Verificación estática con @ts-expect-error para verificar el contrato de tipos
      AuditService.buildAuditData({
        action: AuditAction.EDIT_MESSAGE,
        // @ts-expect-error EDIT_MESSAGE no debe admitir metadata
        metadata: { text: "privado" },
      });

      AuditService.buildAuditData({
        action: AuditAction.CREATE_CONVERSATION,
        // @ts-expect-error CREATE_CONVERSATION requiere conversationType
        metadata: { wrongKey: true },
      });
    });
  });

  describe("record", () => {
    it("llama a AuditRepository.create una vez con los datos armados", async () => {
      vi.mocked(AuditRepository.create).mockResolvedValueOnce({} as any);

      await AuditService.record({
        action: AuditAction.ADD_MEMBER,
        conversationId: "conv-1",
        metadata: { memberId: "user-2" },
      });

      expect(AuditRepository.create).toHaveBeenCalledTimes(1);
      expect(AuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ADD_MEMBER,
          conversationId: "conv-1",
          metadata: { memberId: "user-2" },
        }),
      );
    });

    it("NO tira si el repositorio rechaza, y loguea en error", async () => {
      const dbError = new Error("Database connection lost");
      vi.mocked(AuditRepository.create).mockRejectedValueOnce(dbError);

      const errorSpy = vi.spyOn(getLogger(), "error").mockImplementation(() => getLogger());

      await expect(
        AuditService.record({
          action: AuditAction.SEND_MESSAGE,
          messageId: "msg-123",
          metadata: { messageType: "TEXT", fileCount: 0 },
        }),
      ).resolves.not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          err: dbError,
          action: AuditAction.SEND_MESSAGE,
        }),
        "failed to write audit log",
      );

      errorSpy.mockRestore();
    });
  });
});
