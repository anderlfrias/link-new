import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      count: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationMember: {
      findUnique: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    conversationGroupSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    chatAuditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import {
  clearHiddenForMembers,
  countExistingUsers,
  countUnread,
  findLastMessagesByIds,
  isConversationMember,
  markDelivered,
} from "./conversation.repository";

describe("conversation.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("countExistingUsers", () => {
    it("devuelve 0 inmediatamente si userIds está vacío sin consultar la DB", async () => {
      const count = await countExistingUsers([]);
      expect(count).toBe(0);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it("consulta la cantidad en Prisma cuando se pasan userIds", async () => {
      vi.mocked(prisma.user.count).mockResolvedValue(2);
      const count = await countExistingUsers(["u-1", "u-2"]);
      expect(count).toBe(2);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { id: { in: ["u-1", "u-2"] } },
      });
    });
  });

  describe("findLastMessagesByIds", () => {
    it("devuelve array vacío inmediatamente si messageIds está vacío", async () => {
      const result = await findLastMessagesByIds([]);
      expect(result).toEqual([]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it("busca los mensajes en Prisma cuando hay IDs", async () => {
      const mockMessages = [{ id: "m-1", content: "hola" }] as any;
      vi.mocked(prisma.message.findMany).mockResolvedValue(mockMessages);

      const result = await findLastMessagesByIds(["m-1"]);
      expect(result).toEqual(mockMessages);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["m-1"] } },
        select: {
          id: true,
          type: true,
          content: true,
          deletedAt: true,
          files: { select: { id: true }, take: 1 },
        },
      });
    });
  });

  describe("clearHiddenForMembers", () => {
    it("devuelve { count: 0 } si userIds está vacío sin llamar a Prisma", async () => {
      const result = await clearHiddenForMembers("c-1", []);
      expect(result).toEqual({ count: 0 });
      expect(prisma.conversationMember.updateMany).not.toHaveBeenCalled();
    });

    it("ejecuta updateMany cuando hay userIds", async () => {
      vi.mocked(prisma.conversationMember.updateMany).mockResolvedValue({ count: 1 });

      const result = await clearHiddenForMembers("c-1", ["u-1"]);
      expect(result).toEqual({ count: 1 });
      expect(prisma.conversationMember.updateMany).toHaveBeenCalledWith({
        where: { conversationId: "c-1", userId: { in: ["u-1"] }, hiddenAt: { not: null } },
        data: { hiddenAt: null },
      });
    });
  });

  describe("markDelivered", () => {
    it("devuelve true si se actualizó al menos un registro (count > 0)", async () => {
      vi.mocked(prisma.conversationMember.updateMany).mockResolvedValue({ count: 1 });

      const date = new Date();
      const advanced = await markDelivered("c-1", "u-1", "m-1", date);

      expect(advanced).toBe(true);
      expect(prisma.conversationMember.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: "c-1",
          userId: "u-1",
          OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: date } }],
        },
        data: { lastDeliveredMessageId: "m-1", lastDeliveredAt: date },
      });
    });

    it("devuelve false si count fue 0 (no avanzó)", async () => {
      vi.mocked(prisma.conversationMember.updateMany).mockResolvedValue({ count: 0 });

      const advanced = await markDelivered("c-1", "u-1", "m-1", new Date());
      expect(advanced).toBe(false);
    });
  });

  describe("countUnread", () => {
    it("incluye filtro de fecha cuando since no es null", async () => {
      vi.mocked(prisma.message.count).mockResolvedValue(5);
      const sinceDate = new Date("2026-01-01T00:00:00Z");

      const count = await countUnread("c-1", "u-1", sinceDate);

      expect(count).toBe(5);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: "c-1",
          deletedAt: null,
          senderId: { not: "u-1" },
          createdAt: { gt: sinceDate },
        },
      });
    });

    it("omite filtro de fecha cuando since es null", async () => {
      vi.mocked(prisma.message.count).mockResolvedValue(10);

      const count = await countUnread("c-1", "u-1", null);

      expect(count).toBe(10);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: "c-1",
          deletedAt: null,
          senderId: { not: "u-1" },
        },
      });
    });
  });

  describe("isConversationMember", () => {
    it("devuelve true si existe la membresía", async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue({ id: "m-1" } as any);

      const isMember = await isConversationMember("c-1", "u-1");
      expect(isMember).toBe(true);
      expect(prisma.conversationMember.findUnique).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: "c-1", userId: "u-1" } },
      });
    });

    it("devuelve false si findUnique devuelve null", async () => {
      vi.mocked(prisma.conversationMember.findUnique).mockResolvedValue(null);

      const isMember = await isConversationMember("c-1", "u-1");
      expect(isMember).toBe(false);
    });
  });
});
