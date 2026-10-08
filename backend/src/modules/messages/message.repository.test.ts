import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    messageFile: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    poll: {
      deleteMany: vi.fn(),
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
          where: { conversationId: "conv-1" },
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
          where: { conversationId: "conv-1" },
          take: 20,
          cursor: { id: "msg-cursor" },
          skip: 1,
        }),
      );
    });

    it("filtra por query insensible a mayúsculas si se provee texto", async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([]);

      await listMessages("conv-1", { limit: 10, query: "  reunión  " });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId: "conv-1",
            deletedAt: null,
            content: {
              contains: "reunión",
              mode: "insensitive",
            },
          },
          take: 10,
        }),
      );
    });

    it("no agrega filtro de content si la query consiste solo en espacios", async () => {
      vi.mocked(prisma.message.findMany).mockResolvedValue([]);

      await listMessages("conv-1", { limit: 10, query: "   " });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId: "conv-1",
          },
          take: 10,
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
    beforeEach(() => {
      // Forma de array de `$transaction`: las operaciones ya vienen armadas y se resuelven juntas.
      vi.mocked(prisma.$transaction).mockImplementation(async (operations: any) => Promise.all(operations));
    });

    it("marca deletedAt y deletedById, vacía el contenido y devuelve el mensaje actualizado", async () => {
      const deleted = { id: "msg-1", deletedAt: new Date() };
      vi.mocked(prisma.message.update).mockResolvedValue(deleted as any);
      vi.mocked(prisma.poll.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.messageFile.deleteMany).mockResolvedValue({ count: 0 });

      const result = await softDelete("msg-1", "u-1");

      expect(result).toBe(deleted);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: { deletedAt: expect.any(Date), deletedById: "u-1", content: "" },
      });
    });

    it("borra la encuesta y la relación con los archivos en la misma transacción", async () => {
      vi.mocked(prisma.message.update).mockResolvedValue({ id: "msg-1" } as any);
      vi.mocked(prisma.poll.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.messageFile.deleteMany).mockResolvedValue({ count: 2 });

      await softDelete("msg-1", "u-1");

      expect(prisma.poll.deleteMany).toHaveBeenCalledWith({ where: { messageId: "msg-1" } });
      expect(prisma.messageFile.deleteMany).toHaveBeenCalledWith({ where: { messageId: "msg-1" } });
      // Una sola transacción con las tres operaciones: o se descarta todo el contenido o nada.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(vi.mocked(prisma.$transaction).mock.calls[0][0]).toHaveLength(3);
    });
  });

  describe("softDeleteOlderThan", () => {
    beforeEach(() => {
      vi.mocked(prisma.$transaction).mockImplementation(async (operations: any) => Promise.all(operations));
    });

    it("vacía el contenido de los mensajes vencidos, marca deletedAt y devuelve el count", async () => {
      vi.mocked(prisma.poll.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.messageFile.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 42 });
      const cutoff = new Date("2025-01-01");

      const count = await softDeleteOlderThan(cutoff);

      expect(count).toBe(42);
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: cutoff }, deletedAt: null },
        data: { deletedAt: expect.any(Date), content: "" },
      });
    });

    it("borra las encuestas y la relación con los archivos de los mismos mensajes, en una transacción y antes del update", async () => {
      vi.mocked(prisma.poll.deleteMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.messageFile.deleteMany).mockResolvedValue({ count: 5 });
      vi.mocked(prisma.message.updateMany).mockResolvedValue({ count: 42 });
      const cutoff = new Date("2025-01-01");

      await softDeleteOlderThan(cutoff);

      const expired = { createdAt: { lt: cutoff }, deletedAt: null };
      expect(prisma.poll.deleteMany).toHaveBeenCalledWith({ where: { message: expired } });
      expect(prisma.messageFile.deleteMany).toHaveBeenCalledWith({ where: { message: expired } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Después del update esos mensajes ya no matchearían (deletedAt dejaría de ser null).
      const order = [
        vi.mocked(prisma.poll.deleteMany).mock.invocationCallOrder[0],
        vi.mocked(prisma.messageFile.deleteMany).mock.invocationCallOrder[0],
        vi.mocked(prisma.message.updateMany).mock.invocationCallOrder[0],
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
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
