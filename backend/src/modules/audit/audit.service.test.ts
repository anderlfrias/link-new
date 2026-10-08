import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditAction, ConversationType } from "@prisma/client";
import { runWithContext, getLogger } from "../../config/request-context";
import * as AuditRepository from "./audit.repository";
import * as AuditService from "./audit.service";
import { DEFAULT_ADMIN_AUDIT_ACTIONS } from "./audit.types";

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
          metadata: { provider: "mi-proveedor" },
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
          metadata: { provider: "mi-proveedor", reason: "invalid_credentials" },
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

  describe("listAuditLogs", () => {
    it("sin filtro action, aplica el default de §4.0 (solo admin+auth)", async () => {
      vi.mocked(AuditRepository.listForAdmin).mockResolvedValue([]);

      await AuditService.listAuditLogs({});

      expect(AuditRepository.listForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: [
            AuditAction.LOGIN,
            AuditAction.LOGIN_FAILED,
            AuditAction.CHANGE_PASSWORD,
            AuditAction.CREATE_USER,
            AuditAction.UPDATE_USER,
            AuditAction.RESET_PASSWORD,
            AuditAction.UPDATE_SETTINGS,
            AuditAction.ADMIN_DELETE_FILE,
          ],
        }),
        expect.anything(),
      );
    });

    it("el default nunca incluye actividad del chat (privacidad por omisión)", () => {
      const chatActions: AuditAction[] = [
        AuditAction.SEND_MESSAGE,
        AuditAction.EDIT_MESSAGE,
        AuditAction.DELETE_MESSAGE,
        AuditAction.FORWARD_MESSAGE,
        AuditAction.CREATE_CONVERSATION,
      ];

      expect(DEFAULT_ADMIN_AUDIT_ACTIONS.filter((action) => chatActions.includes(action))).toEqual([]);
    });

    it("con action explícito incluyendo acciones de chat, las devuelve", async () => {
      const mockRows = [
        {
          id: "log-msg-1",
          action: AuditAction.SEND_MESSAGE,
          createdAt: new Date("2026-09-10T12:00:00.000Z"),
          userId: "u-1",
          actorEmail: "alice@example.com",
          user: { id: "u-1", email: "alice@example.com", name: "Alice" },
          conversationId: "c-1",
          conversation: { id: "c-1", name: null, type: ConversationType.PRIVATE },
          messageId: "m-1",
          targetType: null,
          targetId: null,
          metadata: { messageType: "TEXT", fileCount: 0 },
          ip: "10.0.0.1",
          userAgent: "TestAgent",
          requestId: "req-1",
        },
      ];
      vi.mocked(AuditRepository.listForAdmin).mockResolvedValue(mockRows as any);

      const result = await AuditService.listAuditLogs({ action: AuditAction.SEND_MESSAGE });

      expect(AuditRepository.listForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SEND_MESSAGE,
        }),
        expect.anything(),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].action).toBe(AuditAction.SEND_MESSAGE);
    });

    it("limit mayor a 200 se topea a 200", async () => {
      vi.mocked(AuditRepository.listForAdmin).mockResolvedValue([]);

      await AuditService.listAuditLogs({}, { limit: 350 });

      // Capped at 200, so repository receives limit: 201 (limit + 1)
      expect(AuditRepository.listForAdmin).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: 201,
        }),
      );
    });

    it("nextCursor es el id de la última fila cuando hay más, y null cuando no", async () => {
      const generateLogs = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: `log-${i + 1}`,
          action: AuditAction.LOGIN,
          createdAt: new Date(),
          userId: `u-${i}`,
          actorEmail: `u${i}@test.com`,
          user: null,
          conversationId: null,
          conversation: null,
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          userAgent: null,
          requestId: null,
        }));

      // Cuando hay más (51 filas retornadas para limit 50)
      vi.mocked(AuditRepository.listForAdmin).mockResolvedValueOnce(generateLogs(51) as any);
      const resWithMore = await AuditService.listAuditLogs({}, { limit: 50 });
      expect(resWithMore.items).toHaveLength(50);
      expect(resWithMore.nextCursor).toBe("log-50");

      // Cuando no hay más (50 o menos filas)
      vi.mocked(AuditRepository.listForAdmin).mockResolvedValueOnce(generateLogs(50) as any);
      const resNoMore = await AuditService.listAuditLogs({}, { limit: 50 });
      expect(resNoMore.items).toHaveLength(50);
      expect(resNoMore.nextCursor).toBeNull();
    });

    it("conversationName es null para una conversación PRIVATE y trae el nombre para una GROUP", async () => {
      const mockRows = [
        {
          id: "log-private",
          action: AuditAction.SEND_MESSAGE,
          createdAt: new Date(),
          userId: "u-1",
          actorEmail: "alice@test.com",
          user: { id: "u-1", email: "alice@test.com", name: "Alice" },
          conversationId: "conv-priv",
          conversation: { id: "conv-priv", name: "Bob", type: ConversationType.PRIVATE },
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          userAgent: null,
          requestId: null,
        },
        {
          id: "log-group",
          action: AuditAction.CHANGE_NAME,
          createdAt: new Date(),
          userId: "u-2",
          actorEmail: "bob@test.com",
          user: { id: "u-2", email: "bob@test.com", name: "Bob" },
          conversationId: "conv-grp",
          conversation: { id: "conv-grp", name: "Equipo Guardia", type: ConversationType.GROUP },
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: null,
          userAgent: null,
          requestId: null,
        },
      ];

      vi.mocked(AuditRepository.listForAdmin).mockResolvedValue(mockRows as any);

      const res = await AuditService.listAuditLogs({
        action: [AuditAction.SEND_MESSAGE, AuditAction.CHANGE_NAME],
      });

      expect(res.items).toHaveLength(2);
      // Para PRIVATE debe ser estrictamente null
      expect(res.items[0].conversationName).toBeNull();
      // Para GROUP debe preservar el nombre
      expect(res.items[1].conversationName).toBe("Equipo Guardia");
    });
  });
});
