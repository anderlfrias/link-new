import {
  AuditAction,
  ConversationGroupSettings,
  ConversationType,
  GroupPermissionLevel,
  MessageType,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";

const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ to: mockTo, emit: mockEmit }));

vi.mock("../../socket", () => ({
  getIO: vi.fn(() => ({
    to: mockTo,
    emit: mockEmit,
  })),
}));

vi.mock("./conversation.repository");
vi.mock("../settings/settings.service");
vi.mock("../audit/audit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audit/audit.service")>();
  return {
    ...actual,
    record: vi.fn(actual.record),
  };
});
vi.mock("../audit/audit.repository");

import { getIO } from "../../socket";
import * as SettingsService from "../settings/settings.service";
import * as AuditService from "../audit/audit.service";
import * as AuditRepository from "../audit/audit.repository";
import * as ConversationRepository from "./conversation.repository";
import { CONVERSATION_EVENTS } from "./conversation.socket";
import {
  addMembers,
  aggregateReceiptStatus,
  assertMembership,
  buildLastMessagePreview,
  computeReceipts,
  createConversation,
  deleteConversation,
  getOrCreateSelfChat,
  listConversations,
  markConversationRead,
  markDelivered,
  removeMember,
  setConversationFavorite,
  setConversationPinned,
  setMemberAdminStatus,
  updateConversation,
  updateGroupSettings,
} from "./conversation.service";
import { ConversationMemberWithUser, ConversationWithMembers } from "./conversation.types";

function buildMockMember(overrides: Partial<ConversationMemberWithUser> = {}): ConversationMemberWithUser {
  return {
    id: "mem-1",
    conversationId: "conv-1",
    userId: "u-1",
    isAdmin: false,
    isPinned: false,
    isFavorite: false,
    hiddenAt: null,
    lastReadAt: null,
    lastReadMessageId: null,
    lastDeliveredAt: null,
    lastDeliveredMessageId: null,
    joinedAt: new Date(),
    user: {
      id: "u-1",
      name: "User One",
      email: "u1@test.com",
      avatarFileId: null,
      avatarFile: null,
      status: "ACTIVE",
    },
    ...overrides,
  };
}

function buildMockConversation(overrides: Partial<ConversationWithMembers> = {}): ConversationWithMembers {
  return {
    id: "conv-1",
    type: ConversationType.GROUP,
    name: "Grupo Test",
    imageFileId: null,
    imageFile: null,
    createdById: "u-creator",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastMessageId: null,
    lastMessageAt: null,
    lastMessageSenderId: null,
    members: [
      buildMockMember({ userId: "u-creator", isAdmin: true }),
      buildMockMember({ userId: "u-member", isAdmin: false }),
    ],
    ...overrides,
  };
}

describe("conversation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeReceipts", () => {
    const msgCreatedAt = new Date("2026-03-01T12:00:00Z");

    it("excluye al autor del mensaje y marca sent si ningún destinatario ha recibido o leído", () => {
      const members = [
        buildMockMember({ userId: "author-1" }),
        buildMockMember({ userId: "recipient-1", lastReadAt: null, lastDeliveredAt: null }),
      ];

      const receipts = computeReceipts(members, { senderId: "author-1", createdAt: msgCreatedAt });

      expect(receipts).toEqual([{ userId: "recipient-1", status: "sent" }]);
    });

    it("asigna read si lastReadAt >= createdAt", () => {
      const members = [
        buildMockMember({ userId: "author-1" }),
        buildMockMember({
          userId: "recipient-1",
          lastReadAt: new Date("2026-03-01T12:05:00Z"),
          lastDeliveredAt: new Date("2026-03-01T12:01:00Z"),
        }),
      ];

      const receipts = computeReceipts(members, { senderId: "author-1", createdAt: msgCreatedAt });

      expect(receipts).toEqual([{ userId: "recipient-1", status: "read" }]);
    });

    it("asigna delivered si lastDeliveredAt >= createdAt pero lastReadAt es anterior o null", () => {
      const members = [
        buildMockMember({ userId: "author-1" }),
        buildMockMember({
          userId: "recipient-1",
          lastReadAt: null,
          lastDeliveredAt: new Date("2026-03-01T12:01:00Z"),
        }),
      ];

      const receipts = computeReceipts(members, { senderId: "author-1", createdAt: msgCreatedAt });

      expect(receipts).toEqual([{ userId: "recipient-1", status: "delivered" }]);
    });
  });

  describe("aggregateReceiptStatus (Invariante obligatoria)", () => {
    it("devuelve sent para array vacío", () => {
      expect(aggregateReceiptStatus([])).toBe("sent");
    });

    it("devuelve read solo si todos los recibos están en read", () => {
      expect(
        aggregateReceiptStatus([
          { userId: "u1", status: "read" },
          { userId: "u2", status: "read" },
        ]),
      ).toBe("read");
    });

    it("devuelve delivered si todos están entre read y delivered", () => {
      expect(
        aggregateReceiptStatus([
          { userId: "u1", status: "read" },
          { userId: "u2", status: "delivered" },
        ]),
      ).toBe("delivered");
      expect(
        aggregateReceiptStatus([
          { userId: "u1", status: "delivered" },
          { userId: "u2", status: "delivered" },
        ]),
      ).toBe("delivered");
    });

    it("devuelve sent si al menos uno está en sent", () => {
      expect(
        aggregateReceiptStatus([
          { userId: "u1", status: "read" },
          { userId: "u2", status: "sent" },
        ]),
      ).toBe("sent");
    });
  });

  describe("buildLastMessagePreview (Invariante obligatoria)", () => {
    it("mensaje borrado (con deletedAt) muestra siempre 'Mensaje eliminado' aunque tenga texto", () => {
      const preview = buildLastMessagePreview({
        content: "Mensaje de texto que fue borrado",
        deletedAt: new Date(),
        files: [{ id: "file-1" }],
      });
      expect(preview).toBe("Mensaje eliminado");
    });

    it("mensaje sin deletedAt colapsa espacios en blanco de su contenido", () => {
      const preview = buildLastMessagePreview({
        content: "  Hola   \n  mundo  ",
        deletedAt: null,
        files: [],
      });
      expect(preview).toBe("Hola mundo");
    });

    it("mensaje sin texto pero con archivos adjuntos muestra '📎 Archivo adjunto'", () => {
      const preview = buildLastMessagePreview({
        content: "   ",
        deletedAt: null,
        files: [{ id: "file-1" }],
      });
      expect(preview).toBe("📎 Archivo adjunto");
    });

    it("mensaje sin texto y sin archivos devuelve string vacío", () => {
      const preview = buildLastMessagePreview({
        content: "",
        deletedAt: null,
        files: [],
      });
      expect(preview).toBe("");
    });

    it("mensaje tipo CONTACT muestra '👤 Contacto: [Nombre]' o '👤 Contacto'", () => {
      const preview = buildLastMessagePreview({
        content: JSON.stringify({ name: "Carlos Perez" }),
        deletedAt: null,
        files: [],
        type: MessageType.CONTACT,
      });
      expect(preview).toBe("👤 Contacto: Carlos Perez");

      const previewFallback = buildLastMessagePreview({
        content: "invalid json",
        deletedAt: null,
        files: [],
        type: MessageType.CONTACT,
      });
      expect(previewFallback).toBe("👤 Contacto");
    });
  });

  describe("assertMembership (Invariante obligatoria)", () => {
    it("devuelve la conversación si el usuario es miembro activo", async () => {
      const mockConv = buildMockConversation({
        members: [buildMockMember({ userId: "u-active" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(mockConv);

      const result = await assertMembership("conv-1", "u-active");
      expect(result).toBe(mockConv);
    });

    it("lanza NotFoundError si la conversación no existe o está borrada", async () => {
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(null);

      await expect(assertMembership("conv-not-found", "u-active")).rejects.toThrow(NotFoundError);
      await expect(assertMembership("conv-not-found", "u-active")).rejects.toThrow(
        "Conversation not found",
      );
    });

    it("lanza ForbiddenError si la conversación existe pero el usuario no es miembro", async () => {
      const mockConv = buildMockConversation({
        members: [buildMockMember({ userId: "other-user" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(mockConv);

      await expect(assertMembership("conv-1", "intruder-user")).rejects.toThrow(ForbiddenError);
      await expect(assertMembership("conv-1", "intruder-user")).rejects.toThrow(
        "You are not a member of this conversation",
      );
    });
  });

  describe("deleteConversation (Invariante obligatoria de permisos de grupo)", () => {
    it("rechaza el borrado de grupo si allowGroupDelete es false, incluso para ADMIN de la app", async () => {
      const mockConv = buildMockConversation({ type: ConversationType.GROUP });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(mockConv);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowGroupDelete: false,
      } as any);

      await expect(
        deleteConversation("u-creator", "conv-1", [ADMIN_ROLE]),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        deleteConversation("u-creator", "conv-1", [ADMIN_ROLE]),
      ).rejects.toThrow("Group deletion is disabled by an administrator");
    });

    it("permite el borrado de grupo si allowGroupDelete es true y se cumple el permiso", async () => {
      const mockConv = buildMockConversation({
        type: ConversationType.GROUP,
        createdById: "u-creator",
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(mockConv);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowGroupDelete: true,
      } as any);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanDeleteGroup: GroupPermissionLevel.CREATOR_ONLY,
      } as any);

      const result = await deleteConversation("u-creator", "conv-1", []);

      expect(result).toEqual({ conversationId: "conv-1" });
      expect(ConversationRepository.softDelete).toHaveBeenCalledWith("conv-1");
    });

    it("borrado de PRIVATE oculta la conversación solo para el usuario actual", async () => {
      const mockConv = buildMockConversation({
        type: ConversationType.PRIVATE,
        members: [buildMockMember({ userId: "u-1" }), buildMockMember({ userId: "u-2" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(mockConv);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowConversationDelete: true,
      } as any);

      const result = await deleteConversation("u-1", "conv-1", []);

      expect(result).toEqual({ conversationId: "conv-1" });
      expect(ConversationRepository.setMemberHidden).toHaveBeenCalledWith(
        "conv-1",
        "u-1",
        expect.any(Date),
      );
      expect(ConversationRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("createConversation", () => {
    it("rechaza si type es SELF indicando usar POST /conversations/self", async () => {
      await expect(
        createConversation("u-1", { type: ConversationType.SELF, memberIds: ["u-1"] }, []),
      ).rejects.toThrow(BadRequestError);
      await expect(
        createConversation("u-1", { type: ConversationType.SELF, memberIds: ["u-1"] }, []),
      ).rejects.toThrow("Use POST /conversations/self to get or create your own saved-messages chat");
    });

    it("PRIVATE: rechaza si hay más o menos de 1 otro miembro", async () => {
      await expect(
        createConversation(
          "u-1",
          { type: ConversationType.PRIVATE, memberIds: ["u-2", "u-3"] },
          [],
        ),
      ).rejects.toThrow("A private conversation requires exactly one other member");
    });

    it("PRIVATE: devuelve la conversación existente si ya existía entre ambos", async () => {
      const existingConv = buildMockConversation({
        type: ConversationType.PRIVATE,
        members: [buildMockMember({ userId: "u-1", hiddenAt: new Date() }), buildMockMember({ userId: "u-2" })],
      });
      vi.mocked(ConversationRepository.findPrivateConversationBetween).mockResolvedValue(existingConv);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(1);

      const result = await createConversation(
        "u-1",
        { type: ConversationType.PRIVATE, memberIds: ["u-2"] },
        [],
      );

      expect(result).toBe(existingConv);
      expect(ConversationRepository.setMemberHidden).toHaveBeenCalledWith(existingConv.id, "u-1", null);
    });

    it("GROUP: rechaza si whoCanCreateGroups es APP_ADMINS_ONLY y el usuario no es admin", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.APP_ADMINS_ONLY,
        maxGroupMembers: 10,
      } as any);

      await expect(
        createConversation(
          "u-1",
          { type: ConversationType.GROUP, memberIds: ["u-2", "u-3"], name: "Group" },
          [],
        ),
      ).rejects.toThrow("Only admins can create group conversations");
    });

    it("GROUP: rechaza si hay menos de dos otros miembros", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);

      await expect(
        createConversation("u-1", { type: ConversationType.GROUP, memberIds: ["u-2"], name: "Group" }, []),
      ).rejects.toThrow("A group conversation requires at least two other members");
    });

    it("GROUP: rechaza si supera maxGroupMembers (contando al propio creador)", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 2,
      } as any);

      await expect(
        createConversation(
          "u-1",
          { type: ConversationType.GROUP, memberIds: ["u-2", "u-3"], name: "Group" },
          [],
        ),
      ).rejects.toThrow("A group conversation cannot have more than 2 members");
    });

    it("GROUP: rechaza si no se manda name (o viene vacío)", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);

      await expect(
        createConversation(
          "u-1",
          { type: ConversationType.GROUP, memberIds: ["u-2", "u-3"], name: "   " },
          [],
        ),
      ).rejects.toThrow("name is required for group conversations");
    });

    it("rechaza si alguno de los otros miembros no existe en la base", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(1); // pedimos 2, existe 1

      await expect(
        createConversation(
          "u-1",
          { type: ConversationType.GROUP, memberIds: ["u-2", "u-inexistente"], name: "Group" },
          [],
        ),
      ).rejects.toThrow("One or more members do not exist");
    });

    it("GROUP: crea el grupo y emite evento CREATED por socket", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(2);
      const createdConv = buildMockConversation({
        type: ConversationType.GROUP,
        members: [
          buildMockMember({ userId: "u-1" }),
          buildMockMember({ userId: "u-2" }),
          buildMockMember({ userId: "u-3" }),
        ],
      });
      vi.mocked(ConversationRepository.createConversation).mockResolvedValue(createdConv);

      const result = await createConversation(
        "u-1",
        { type: ConversationType.GROUP, memberIds: ["u-2", "u-3"], name: "Nuevo Grupo" },
        [],
      );

      expect(result).toBe(createdConv);
      expect(mockEmit).toHaveBeenCalledWith(CONVERSATION_EVENTS.CREATED, createdConv);
    });

    it("devuelve la conversación creada aunque la auditoría falle al escribir", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(2);
      const createdConv = buildMockConversation({
        type: ConversationType.GROUP,
        members: [
          buildMockMember({ userId: "u-1" }),
          buildMockMember({ userId: "u-2" }),
          buildMockMember({ userId: "u-3" }),
        ],
      });
      vi.mocked(ConversationRepository.createConversation).mockResolvedValue(createdConv);
      vi.mocked(AuditRepository.create).mockRejectedValueOnce(new Error("Audit DB down"));

      const result = await createConversation(
        "u-1",
        { type: ConversationType.GROUP, memberIds: ["u-2", "u-3"], name: "Nuevo Grupo" },
        [],
      );

      expect(result).toBe(createdConv);
    });
  });

  describe("getOrCreateSelfChat", () => {
    it("devuelve el chat existente si ya existe", async () => {
      const existing = buildMockConversation({
        type: ConversationType.SELF,
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findSelfChat).mockResolvedValue(existing);

      const result = await getOrCreateSelfChat("u-1");
      expect(result).toBe(existing);
      expect(ConversationRepository.createConversation).not.toHaveBeenCalled();
    });

    it("crea un nuevo SELF chat si no existía", async () => {
      vi.mocked(ConversationRepository.findSelfChat).mockResolvedValue(null);
      const created = buildMockConversation({ type: ConversationType.SELF });
      vi.mocked(ConversationRepository.createConversation).mockResolvedValue(created);

      const result = await getOrCreateSelfChat("u-1");
      expect(result).toBe(created);
      expect(ConversationRepository.createConversation).toHaveBeenCalledWith({
        type: ConversationType.SELF,
        createdById: "u-1",
        memberIds: ["u-1"],
      });
    });
  });

  describe("listConversations", () => {
    it("ordena fijados primero y computa unreadCount y receipts", async () => {
      const convUnpinned = buildMockConversation({
        id: "c-1",
        members: [buildMockMember({ userId: "u-1", isPinned: false })],
      });
      const convPinned = buildMockConversation({
        id: "c-2",
        members: [buildMockMember({ userId: "u-1", isPinned: true })],
      });

      vi.mocked(ConversationRepository.listForUser).mockResolvedValue([convUnpinned, convPinned]);
      vi.mocked(ConversationRepository.findLastMessagesByIds).mockResolvedValue([]);
      vi.mocked(ConversationRepository.countUnread).mockResolvedValue(3);

      const list = await listConversations("u-1");

      expect(list).toHaveLength(2);
      expect(list[0].id).toBe("c-2"); // Pinned first
      expect(list[1].id).toBe("c-1");
      expect(list[0].unreadCount).toBe(3);
    });
  });

  describe("updateConversation", () => {
    it("rechaza si la conversación no es GROUP", async () => {
      const privateConv = buildMockConversation({
        type: ConversationType.PRIVATE,
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(privateConv);

      await expect(
        updateConversation("u-1", "c-1", { name: "New Name" }, []),
      ).rejects.toThrow("Only group conversations can be renamed or have their image changed");
    });

    it("rechaza si el usuario no tiene permiso según whoCanChangeGroupInfo", async () => {
      const group = buildMockConversation({ members: [buildMockMember({ userId: "u-regular", isAdmin: false })] });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      } as any);

      await expect(
        updateConversation("u-regular", "c-1", { name: "New Name" }, []),
      ).rejects.toThrow("You are not allowed to change this group's name or image");
      expect(ConversationRepository.updateDetails).not.toHaveBeenCalled();
    });

    it("actualiza nombre e imagen y loguea CHANGE_NAME y CHANGE_IMAGE por separado", async () => {
      const group = buildMockConversation({
        name: "Nombre Viejo",
        imageFileId: "img-old",
        members: [buildMockMember({ userId: "admin-1", isAdmin: true })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
      } as any);
      const updated = buildMockConversation({ name: "Nombre Nuevo", imageFileId: "img-new" });
      vi.mocked(ConversationRepository.updateDetails).mockResolvedValue(updated);

      const result = await updateConversation(
        "admin-1",
        "c-1",
        { name: "Nombre Nuevo", imageFileId: "img-new" },
        [],
      );

      expect(result).toBe(updated);
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANGE_NAME,
          metadata: { from: "Nombre Viejo", to: "Nombre Nuevo" },
        }),
      );
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHANGE_IMAGE,
          metadata: { from: "img-old", to: "img-new" },
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(CONVERSATION_EVENTS.UPDATED, updated);
    });

    it("no loguea CHANGE_NAME ni CHANGE_IMAGE si esos campos no vinieron en el input", async () => {
      const group = buildMockConversation({ members: [buildMockMember({ userId: "admin-1", isAdmin: true })] });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
      } as any);
      vi.mocked(ConversationRepository.updateDetails).mockResolvedValue(group);

      await updateConversation("admin-1", "c-1", {}, []);

      expect(AuditService.record).not.toHaveBeenCalled();
    });
  });

  describe("addMembers", () => {
    it("rechaza si ningún usuario nuevo es agregado", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" }), buildMockMember({ userId: "u-2" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);

      await expect(addMembers("u-1", "c-1", ["u-2"], [])).rejects.toThrow("No new members to add");
    });

    it("rechaza si superaría el máximo de miembros del grupo", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" }), buildMockMember({ userId: "u-2" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 2,
      } as any);

      await expect(addMembers("u-1", "c-1", ["u-nuevo"], [])).rejects.toThrow(
        "A group conversation cannot have more than 2 members",
      );
    });

    it("rechaza si alguno de los usuarios a agregar no existe", async () => {
      const group = buildMockConversation({ members: [buildMockMember({ userId: "u-1" })] });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(0);

      await expect(addMembers("u-1", "c-1", ["u-inexistente"], [])).rejects.toThrow(
        "One or more members do not exist",
      );
    });

    it("agrega miembros nuevos, loguea auditoría por cada uno y emite MEMBER_ADDED + CREATED", async () => {
      const group = buildMockConversation({ members: [buildMockMember({ userId: "u-1", isAdmin: true })] });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 10,
      } as any);
      vi.mocked(ConversationRepository.countExistingUsers).mockResolvedValue(1);

      const result = await addMembers("u-1", "c-1", ["u-nuevo"], []);

      expect(ConversationRepository.addMembers).toHaveBeenCalledWith("c-1", ["u-nuevo"]);
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ADD_MEMBER,
          metadata: { memberId: "u-nuevo" },
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.MEMBER_ADDED,
        expect.objectContaining({ conversationId: "c-1", userIds: ["u-nuevo"] }),
      );
      expect(result).toBe(group);
    });

    it("rechaza si la conversación no es GROUP", async () => {
      const privateConv = buildMockConversation({
        type: ConversationType.PRIVATE,
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(privateConv);

      await expect(addMembers("u-1", "c-1", ["u-2"], [])).rejects.toThrow(
        "Only group conversations support adding members",
      );
    });
  });

  describe("removeMember", () => {
    it("permite salir del grupo (auto-remoción) siempre", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" }), buildMockMember({ userId: "u-2" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      const result = await removeMember("u-1", "c-1", "u-1", []);

      expect(result).toEqual({ conversationId: "c-1", userId: "u-1" });
      expect(ConversationRepository.removeMember).toHaveBeenCalledWith("c-1", "u-1");
    });

    it("rechaza si intenta remover a otro sin tener permisos", async () => {
      const group = buildMockConversation({
        members: [
          buildMockMember({ userId: "u-regular", isAdmin: false }),
          buildMockMember({ userId: "u-target" }),
        ],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue({
        whoCanRemoveMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      } as any);

      await expect(
        removeMember("u-regular", "c-1", "u-target", []),
      ).rejects.toThrow("You are not allowed to remove other members from this conversation");
    });
  });

  describe("setMemberAdminStatus", () => {
    it("impide degradar al creador del grupo", async () => {
      const group = buildMockConversation({
        createdById: "creator-id",
        members: [
          buildMockMember({ userId: "admin-1", isAdmin: true }),
          buildMockMember({ userId: "creator-id", isAdmin: true }),
        ],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      await expect(
        setMemberAdminStatus("admin-1", "c-1", "creator-id", false),
      ).rejects.toThrow("The conversation creator can never be demoted");
    });

    it("promueve a un miembro normal a admin del grupo", async () => {
      const group = buildMockConversation({
        createdById: "creator-id",
        members: [
          buildMockMember({ userId: "admin-1", isAdmin: true }),
          buildMockMember({ userId: "target-user", isAdmin: false }),
        ],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      const result = await setMemberAdminStatus("admin-1", "c-1", "target-user", true);

      expect(result).toEqual({ conversationId: "c-1", userId: "target-user", isAdmin: true });
      expect(ConversationRepository.setMemberAdmin).toHaveBeenCalledWith("c-1", "target-user", true);
      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.MEMBER_ADMIN_CHANGED,
        expect.objectContaining({ userId: "target-user", isAdmin: true }),
      );
    });

    it("rechaza si quien actúa no es admin actual del grupo", async () => {
      const group = buildMockConversation({
        members: [
          buildMockMember({ userId: "u-regular", isAdmin: false }),
          buildMockMember({ userId: "target-user", isAdmin: false }),
        ],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      await expect(setMemberAdminStatus("u-regular", "c-1", "target-user", true)).rejects.toThrow(
        "Only current group admins can promote or demote other members",
      );
    });

    it("lanza NotFoundError si el usuario objetivo no es miembro de la conversación", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "admin-1", isAdmin: true })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      await expect(setMemberAdminStatus("admin-1", "c-1", "no-es-miembro", true)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("rechaza si el usuario objetivo ya tiene el estado de admin pedido (idempotencia explícita)", async () => {
      const group = buildMockConversation({
        members: [
          buildMockMember({ userId: "admin-1", isAdmin: true }),
          buildMockMember({ userId: "target-user", isAdmin: true }),
        ],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      await expect(setMemberAdminStatus("admin-1", "c-1", "target-user", true)).rejects.toThrow(
        "That member is already a group admin",
      );
    });
  });

  describe("updateGroupSettings", () => {
    it("rechaza si la instalación global no permite override para ese flag", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "admin-1", isAdmin: true })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowGroupOverrideAddMembers: false,
      } as any);

      await expect(
        updateGroupSettings("admin-1", "c-1", {
          whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        }),
      ).rejects.toThrow("This installation does not allow per-group overrides for: whoCanAddMembers");
    });

    it("rechaza si quien actúa no es admin de ESE grupo (la autoridad final no vive en el validador de forma)", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-regular", isAdmin: false })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);

      await expect(
        updateGroupSettings("u-regular", "c-1", {
          whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        }),
      ).rejects.toThrow("Only group admins can change this group's settings");
      expect(ConversationRepository.upsertGroupSettings).not.toHaveBeenCalled();
    });

    it("rechaza si la conversación no es GROUP", async () => {
      const privateConv = buildMockConversation({
        type: ConversationType.PRIVATE,
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(privateConv);

      await expect(
        updateGroupSettings("u-1", "c-1", { whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY }),
      ).rejects.toThrow("Only group conversations have group settings");
    });

    it("cuando todos los flags globales lo permiten, persiste el override y devuelve los settings efectivos", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "admin-1", isAdmin: true })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideMaxGroupMembers: true,
      } as any);
      const effective = {
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 20,
      };
      vi.mocked(ConversationRepository.findGroupSettings).mockResolvedValue(null);
      vi.mocked(SettingsService.resolveEffectiveGroupSettings).mockResolvedValue(effective as any);
      vi.mocked(SettingsService.getGroupOverrideAllowedFlags).mockResolvedValue({
        whoCanAddMembers: true,
        maxGroupMembers: true,
      } as any);

      const result = await updateGroupSettings("admin-1", "c-1", {
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 20,
      });

      expect(ConversationRepository.upsertGroupSettings).toHaveBeenCalledWith("c-1", {
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 20,
      });
      expect(result.effective).toEqual(effective);
    });
  });

  describe("setConversationPinned y setConversationFavorite", () => {
    it("setConversationPinned emite preferencia solo a la room personal del usuario que la cambió", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.setMemberPinned).mockResolvedValue({
        isPinned: true,
        isFavorite: false,
      } as any);

      await setConversationPinned("u-1", "c-1", true);

      expect(mockTo).toHaveBeenCalledWith("user:u-1");
      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.MEMBER_PREFERENCE_CHANGED,
        expect.objectContaining({ isPinned: true }),
      );
    });

    it("setConversationFavorite delega en setMemberFavorite y emite MEMBER_PREFERENCE_CHANGED con isFavorite", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.setMemberFavorite).mockResolvedValue({
        isPinned: false,
        isFavorite: true,
      } as any);

      const result = await setConversationFavorite("u-1", "c-1", true);

      expect(ConversationRepository.setMemberFavorite).toHaveBeenCalledWith("c-1", "u-1", true);
      expect(mockTo).toHaveBeenCalledWith("user:u-1");
      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.MEMBER_PREFERENCE_CHANGED,
        expect.objectContaining({ isFavorite: true }),
      );
      expect(result).toEqual({ isPinned: false, isFavorite: true });
    });
  });

  describe("markConversationRead y markDelivered", () => {
    it("markConversationRead emite RECEIPT_UPDATED con kind read", async () => {
      const group = buildMockConversation({
        members: [buildMockMember({ userId: "u-1" })],
      });
      vi.mocked(ConversationRepository.findActiveById).mockResolvedValue(group);
      vi.mocked(ConversationRepository.markRead).mockResolvedValue({
        lastReadMessageId: "m-10",
        lastReadAt: new Date(),
      } as any);

      await markConversationRead("u-1", "c-1", "m-10");

      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.RECEIPT_UPDATED,
        expect.objectContaining({ kind: "read", messageId: "m-10" }),
      );
    });

    it("markDelivered emite RECEIPT_UPDATED con kind delivered solo si avanzó", async () => {
      vi.mocked(ConversationRepository.markDelivered).mockResolvedValue(true);
      const members = [buildMockMember({ userId: "u-1" })];

      await markDelivered("c-1", "u-1", "m-10", new Date(), members);

      expect(mockEmit).toHaveBeenCalledWith(
        CONVERSATION_EVENTS.RECEIPT_UPDATED,
        expect.objectContaining({ kind: "delivered", messageId: "m-10" }),
      );
    });

    it("markDelivered no emite si no avanzó", async () => {
      vi.mocked(ConversationRepository.markDelivered).mockResolvedValue(false);
      const members = [buildMockMember({ userId: "u-1" })];

      await markDelivered("c-1", "u-1", "m-10", new Date(), members);

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });
});
