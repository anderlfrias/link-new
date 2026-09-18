import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    storedFile: {
      count: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    messageFile: {
      findMany: vi.fn(),
    },
    messageReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      update: vi.fn(),
    },
    chatAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        message: {
          create: vi.fn(),
        },
        conversation: {
          update: vi.fn(),
        },
      }),
    ),
  },
}));

import { prisma } from "../../config/prisma";
import {
  addReaction,
  countExistingFiles,
  createMessage,
  existsInConversation,
  findUserReaction,
  getMessageReactions,
  listFiles,
  listMessages,
  removeReaction,
  softDelete,
  softDeleteOlderThan,
  updateContent,
  updateReaction,
} from "./message.repository";

describe("message.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("countExistingFiles", () => {
    it("devuelve 0 inmediatamente si el array de fileIds está vacío", async () => {
      const count = await countExistingFiles([]);
      expect(count).toBe(0);
      expect(prisma.storedFile.count).not.toHaveBeenCalled();
    });

    it("consulta en Prisma cuando hay fileIds", async () => {
      vi.mocked(prisma.storedFile.count).mockResolvedValue(2);

      const count = await countExistingFiles(["f-1", "f-2"]);
      expect(count).toBe(2);
      expect(prisma.storedFile.count).toHaveBeenCalledWith({
        where: { id: { in: ["f-1", "f-2"] }, deletedAt: null },
      });
    });
  });

  describe("createMessage", () => {
    it("crea el mensaje y actualiza conversation.lastMessageId dentro de una transacción", async () => {
      const mockCreatedMessage = {
        id: "msg-1",
        createdAt: new Date(),
        senderId: "u-1",
      };

      const txMock = {
        message: {
          create: vi.fn().mockResolvedValue(mockCreatedMessage),
        },
        conversation: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      const result = await createMessage({
        conversationId: "conv-1",
        senderId: "u-1",
        content: "Hola",
        fileIds: ["f-1"],
      });

      expect(txMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: "conv-1",
            senderId: "u-1",
            content: "Hola",
            files: { create: [{ fileId: "f-1" }] },
          }),
        }),
      );
      expect(txMock.conversation.update).toHaveBeenCalledWith({
        where: { id: "conv-1" },
        data: {
          lastMessageId: "msg-1",
          lastMessageAt: mockCreatedMessage.createdAt,
          lastMessageSenderId: "u-1",
        },
      });
      expect(result).toBe(mockCreatedMessage);
    });
  });

  describe("listMessages", () => {
    it("pagina sin cursor si beforeId no está presente", async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([]);

      await listMessages("conv-1", { limit: 20 });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: "conv-1", deletedAt: null },
          take: 20,
        }),
      );
      const callArgs = vi.mocked(prisma.message.findMany).mock.calls[0][0] as any;
      expect(callArgs.cursor).toBeUndefined();
    });

    it("incluye cursor y skip 1 si beforeId está presente", async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([]);

      await listMessages("conv-1", { beforeId: "msg-cursor", limit: 20 });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: "conv-1", deletedAt: null },
          take: 20,
          cursor: { id: "msg-cursor" },
          skip: 1,
        }),
      );
    });
  });

  describe("listFiles", () => {
    it("incluye cursor y skip 1 cuando se provee beforeId", async () => {
      vi.mocked(prisma.messageFile.findMany).mockResolvedValue([]);

      await listFiles("conv-1", { beforeId: "file-cursor", limit: 10 });

      expect(prisma.messageFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { message: { conversationId: "conv-1", deletedAt: null }, file: { deletedAt: null } },
          take: 10,
          cursor: { id: "file-cursor" },
          skip: 1,
        }),
      );
    });
  });

  describe("existsInConversation", () => {
    it("devuelve true si el mensaje existe en la conversación", async () => {
      vi.mocked(prisma.message.findFirst).mockResolvedValue({ id: "msg-1" } as any);

      const exists = await existsInConversation("msg-1", "conv-1");
      expect(exists).toBe(true);
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { id: "msg-1", conversationId: "conv-1" },
        select: { id: true },
      });
    });

    it("devuelve false si el mensaje no existe", async () => {
      vi.mocked(prisma.message.findFirst).mockResolvedValue(null);

      const exists = await existsInConversation("msg-1", "conv-1");
      expect(exists).toBe(false);
    });
  });

  describe("softDelete", () => {
    it("marca deletedAt y deletedById sin borrar físicamente", async () => {
      vi.mocked(prisma.message.update).mockResolvedValue({ id: "msg-1" } as any);

      await softDelete("msg-1", "u-1");

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: { deletedAt: expect.any(Date), deletedById: "u-1" },
      });
    });
  });

  describe("softDeleteOlderThan", () => {
    it("marca deletedAt en mensajes anteriores a la fecha de corte y devuelve count", async () => {
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 42 });
      const cutoff = new Date("2025-01-01");

      const count = await softDeleteOlderThan(cutoff);

      expect(count).toBe(42);
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: cutoff }, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("updateContent", () => {
    it("actualiza el contenido y registra editedAt", async () => {
      vi.mocked(prisma.message.update).mockResolvedValue({ id: "msg-1", content: "Editado" } as any);

      await updateContent("msg-1", "Editado");

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg-1" },
          data: { content: "Editado", editedAt: expect.any(Date) },
        }),
      );
    });
  });

  describe("findUserReaction", () => {
    it("busca la reacción de un usuario por clave única (messageId, userId)", async () => {
      vi.mocked(prisma.messageReaction.findUnique).mockResolvedValue({ id: "r-1" } as any);

      const result = await findUserReaction("msg-1", "user-1");

      expect(prisma.messageReaction.findUnique).toHaveBeenCalledWith({
        where: {
          messageId_userId: {
            messageId: "msg-1",
            userId: "user-1",
          },
        },
      });
      expect(result).toEqual({ id: "r-1" });
    });
  });

  describe("addReaction", () => {
    it("crea una reacción con datos e include de usuario", async () => {
      vi.mocked(prisma.messageReaction.create).mockResolvedValue({ id: "r-1" } as any);

      const result = await addReaction("msg-1", "user-1", "❤️");

      expect(prisma.messageReaction.create).toHaveBeenCalledWith({
        data: {
          messageId: "msg-1",
          userId: "user-1",
          emoji: "❤️",
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
      expect(result).toEqual({ id: "r-1" });
    });
  });

  describe("updateReaction", () => {
    it("actualiza el emoji de la reacción del usuario", async () => {
      vi.mocked(prisma.messageReaction.update).mockResolvedValue({ id: "r-1", emoji: "😂" } as any);

      const result = await updateReaction("msg-1", "user-1", "😂");

      expect(prisma.messageReaction.update).toHaveBeenCalledWith({
        where: {
          messageId_userId: {
            messageId: "msg-1",
            userId: "user-1",
          },
        },
        data: {
          emoji: "😂",
          createdAt: expect.any(Date),
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
      expect(result).toEqual({ id: "r-1", emoji: "😂" });
    });
  });

  describe("removeReaction", () => {
    it("elimina la reacción por clave única (messageId, userId)", async () => {
      vi.mocked(prisma.messageReaction.delete).mockResolvedValue({ id: "r-1" } as any);

      const result = await removeReaction("msg-1", "user-1");

      expect(prisma.messageReaction.delete).toHaveBeenCalledWith({
        where: {
          messageId_userId: {
            messageId: "msg-1",
            userId: "user-1",
          },
        },
      });
      expect(result).toEqual({ id: "r-1" });
    });
  });

  describe("getMessageReactions", () => {
    it("obtiene las reacciones de un mensaje ordenadas por fecha", async () => {
      vi.mocked(prisma.messageReaction.findMany).mockResolvedValue([{ id: "r-1" }] as any);

      const result = await getMessageReactions("msg-1");

      expect(prisma.messageReaction.findMany).toHaveBeenCalledWith({
        where: { messageId: "msg-1" },
        select: {
          id: true,
          messageId: true,
          userId: true,
          emoji: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toEqual([{ id: "r-1" }]);
    });
  });
});
