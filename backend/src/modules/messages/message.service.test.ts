import { ChatAuditAction, ConversationType, MessageType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";

const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ to: mockTo, emit: mockEmit }));

vi.mock("../../socket", () => ({
  getIO: vi.fn(() => ({
    to: mockTo,
    emit: mockEmit,
  })),
}));

vi.mock("../../socket/rooms", () => ({
  conversationRoomName: vi.fn((id) => `conversation:${id}`),
  userRoomName: vi.fn((id) => `user:${id}`),
  getConnectedUserIds: vi.fn(),
}));

vi.mock("../conversations/conversation.service", () => ({
  assertMembership: vi.fn(),
  buildLastMessagePreview: vi.fn((msg) => (msg.deletedAt ? "Mensaje eliminado" : msg.content || "Adjunto")),
  computeReceipts: vi.fn(() => []),
  markDelivered: vi.fn(),
}));

vi.mock("../conversations/conversation.repository", () => ({
  clearHiddenForMembers: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {},
}));

vi.mock("./message.repository");
vi.mock("../push/push.service", () => ({
  notifyUsers: vi.fn(),
}));
vi.mock("../settings/settings.service");

import { getConnectedUserIds } from "../../socket/rooms";
import * as ConversationService from "../conversations/conversation.service";
import * as PushService from "../push/push.service";
import * as SettingsService from "../settings/settings.service";
import * as MessageRepository from "./message.repository";
import { MESSAGE_EVENTS } from "./message.socket";
import {
  deleteMessage,
  editMessage,
  forwardMessage,
  listConversationFiles,
  listMessages,
  sendMessage,
} from "./message.service";

function buildMockConversation(overrides: any = {}) {
  return {
    id: "conv-1",
    type: ConversationType.GROUP,
    name: "Grupo Test",
    createdById: "u-creator",
    lastMessageId: null,
    members: [
      { userId: "u-1", user: { id: "u-1", name: "User 1" } },
      { userId: "u-2", user: { id: "u-2", name: "User 2" } },
    ],
    ...overrides,
  };
}

function buildMockMessage(overrides: any = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "u-1",
    type: MessageType.TEXT,
    content: "Mensaje original",
    createdAt: new Date(),
    editedAt: null,
    deletedAt: null,
    files: [],
    replyTo: null,
    forwardedFrom: null,
    sender: { id: "u-1", name: "User 1", email: "u1@test.com", avatarFileId: null },
    ...overrides,
  };
}

describe("message.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("crea un mensaje de texto, lo entrega vía socket y envía push a offline", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockCreated = buildMockMessage({ content: "Hola a todos" });
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(mockCreated as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue(["u-1"]); // u-2 is offline

      const result = await sendMessage("u-1", "conv-1", { content: "Hola a todos" });

      expect(ConversationService.assertMembership).toHaveBeenCalledWith("conv-1", "u-1");
      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          senderId: "u-1",
          content: "Hola a todos",
          type: undefined,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.CREATED, expect.objectContaining({ id: "msg-1" }));
      expect(PushService.notifyUsers).toHaveBeenCalledWith(["u-2"], expect.any(Object));
      expect(result.id).toBe("msg-1");
    });

    it("soporta mensajes de tipo STICKER", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(MessageRepository.countExistingFiles).mockResolvedValue(1);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ maxFilesPerMessage: 5 } as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue(["u-1", "u-2"]);

      const mockCreated = buildMockMessage({
        type: MessageType.STICKER,
        content: "",
        files: [
          {
            id: "mf-1",
            fileId: "file-sticker",
            messageId: "msg-1",
            createdAt: new Date(),
            file: { id: "file-sticker", size: 4096n, path: "chat/sticker.gif" },
          },
        ],
      });
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(mockCreated as any);

      const result = await sendMessage("u-1", "conv-1", {
        content: "",
        fileIds: ["file-sticker"],
        type: "STICKER",
      });

      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.STICKER,
          fileIds: ["file-sticker"],
        }),
      );
      // LARGE_FILES_PLAN.md §13, Riesgo 3: StoredFile.size es bigint en
      // Prisma — withPreviews debe convertirlo a number antes de que este
      // mensaje se emita por socket.io o se responda por HTTP, o ambos
      // explotan en cuanto el mensaje trae un adjunto.
      expect(result.files[0].file.size).toBe(4096);
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it("rechaza si replyToId no existe en la conversación", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(MessageRepository.existsInConversation).mockResolvedValue(false);

      await expect(
        sendMessage("u-1", "conv-1", {
          content: "Respuesta",
          replyToId: "msg-inexistente",
        }),
      ).rejects.toThrow(BadRequestError);
      await expect(
        sendMessage("u-1", "conv-1", {
          content: "Respuesta",
          replyToId: "msg-inexistente",
        }),
      ).rejects.toThrow("El mensaje al que querés responder ya no existe en esta conversación.");
    });

    it("rechaza si excede la cantidad máxima de archivos configurada", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ maxFilesPerMessage: 2 } as any);

      await expect(
        sendMessage("u-1", "conv-1", {
          content: "Adjuntos",
          fileIds: ["f1", "f2", "f3"],
        }),
      ).rejects.toThrow("A message can include at most 2 files");
    });
  });

  describe("forwardMessage", () => {
    it("reenvía un mensaje a otra conversación si el usuario es miembro de ambas", async () => {
      const targetConv = buildMockConversation({ id: "conv-target" });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(targetConv as any);

      const sourceMsg = buildMockMessage({
        id: "msg-source",
        conversationId: "conv-source",
        content: "Texto original",
        files: [{ fileId: "f1" }],
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(sourceMsg as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue([]);

      const createdForward = buildMockMessage({
        id: "msg-forwarded",
        conversationId: "conv-target",
        content: "Texto original",
        forwardedFromId: "msg-source",
      });
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(createdForward as any);

      const result = await forwardMessage("u-1", "conv-target", "msg-source");

      // Verifica membresía en destino y en origen
      expect(ConversationService.assertMembership).toHaveBeenCalledWith("conv-target", "u-1");
      expect(ConversationService.assertMembership).toHaveBeenCalledWith("conv-source", "u-1");
      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-target",
          senderId: "u-1",
          content: "Texto original",
          forwardedFromId: "msg-source",
        }),
      );
      expect(result.id).toBe("msg-forwarded");
    });

    it("rechaza si el mensaje de origen no existe", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(null);

      await expect(forwardMessage("u-1", "conv-target", "nonexistent")).rejects.toThrow(NotFoundError);
    });

    it("rechaza si el usuario NO es miembro de la conversación de origen", async () => {
      vi.mocked(ConversationService.assertMembership).mockImplementation(async (convId) => {
        if (convId === "conv-source") {
          throw new ForbiddenError("You are not a member of this conversation");
        }
        return buildMockConversation() as any;
      });

      const sourceMsg = buildMockMessage({ id: "msg-source", conversationId: "conv-source" });
      vi.mocked(MessageRepository.findById).mockResolvedValue(sourceMsg as any);

      await expect(forwardMessage("u-1", "conv-target", "msg-source")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("listMessages", () => {
    it("pagina con cursor y límite acotado, y marca entregado al receptor", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMessages = [
        buildMockMessage({ id: "m-1", createdAt: new Date("2026-01-01T10:00:00Z") }),
        buildMockMessage({ id: "m-2", createdAt: new Date("2026-01-01T10:05:00Z") }),
      ];
      // MessageRepository.listMessages devuelve en orden descendente
      vi.mocked(MessageRepository.listMessages).mockResolvedValue([...mockMessages].reverse() as any);

      const result = await listMessages("u-1", "conv-1", { limit: 50 });

      expect(MessageRepository.listMessages).toHaveBeenCalledWith("conv-1", {
        beforeId: undefined,
        limit: 50,
      });
      expect(ConversationService.markDelivered).toHaveBeenCalledWith(
        "conv-1",
        "u-1",
        "m-2",
        mockMessages[1].createdAt,
        mockConv.members,
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("m-1");
      expect(result[1].id).toBe("m-2");
    });
  });

  describe("listConversationFiles", () => {
    it("lista y mapea archivos adjuntos en la conversación", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);

      const mockEntries = [
        {
          file: {
            id: "f-1",
            path: "uploads/f-1.pdf",
            originalName: "doc.pdf",
            mimeType: "application/pdf",
            // bigint: StoredFile.size real en Prisma (ver schema.prisma) —
            // listConversationFiles pasa por toStoredFileResponse, que debe
            // convertirlo a number.
            size: 1024n,
            createdAt: new Date(),
          },
          message: { id: "m-1", senderId: "u-1", createdAt: new Date() },
        },
      ];
      vi.mocked(MessageRepository.listFiles).mockResolvedValue(mockEntries as any);

      const files = await listConversationFiles("u-1", "conv-1", { limit: 20 });

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe("f-1");
      expect(files[0].messageId).toBe("m-1");
      expect(files[0].senderId).toBe("u-1");
      expect(files[0].size).toBe(1024);
    });
  });

  describe("editMessage (Invariante obligatoria de ventana de tiempo)", () => {
    it("autor edita dentro de la ventana de tiempo -> OK", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const recentDate = new Date(Date.now() - 5 * 60_000); // 5 minutos atrás
      const originalMsg = buildMockMessage({
        id: "msg-1",
        senderId: "u-author",
        createdAt: recentDate,
        type: MessageType.TEXT,
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(originalMsg as any);

      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageEdit: true,
        messageEditTimeLimitMinutes: 15, // Límite de 15 min
      } as any);

      const updatedMsg = { ...originalMsg, content: "Contenido editado" };
      vi.mocked(MessageRepository.updateContent).mockResolvedValue(updatedMsg as any);

      const result = await editMessage("u-author", "conv-1", "msg-1", { content: "Contenido editado" });

      expect(MessageRepository.updateContent).toHaveBeenCalledWith("msg-1", "Contenido editado");
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.UPDATED, expect.objectContaining({ content: "Contenido editado" }));
      expect(result.content).toBe("Contenido editado");
    });

    it("rechaza si otro usuario intenta editar el mensaje", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author" }) as any,
      );

      await expect(
        editMessage("u-not-author", "conv-1", "msg-1", { content: "Nuevo" }),
      ).rejects.toThrow("You can only edit your own messages");
    });

    it("rechaza si el mensaje no es de tipo TEXT", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author", type: MessageType.STICKER }) as any,
      );

      await expect(
        editMessage("u-author", "conv-1", "msg-1", { content: "Nuevo" }),
      ).rejects.toThrow("Only text messages can be edited");
    });

    it("rechaza si la edición está deshabilitada globalmente", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author" }) as any,
      );
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageEdit: false,
      } as any);

      await expect(
        editMessage("u-author", "conv-1", "msg-1", { content: "Nuevo" }),
      ).rejects.toThrow("Message editing is disabled");
    });

    it("rechaza si expiró la ventana de tiempo configurada", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);

      const oldDate = new Date(Date.now() - 30 * 60_000); // 30 minutos atrás
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author", createdAt: oldDate }) as any,
      );
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageEdit: true,
        messageEditTimeLimitMinutes: 15, // Límite de 15 min
      } as any);

      await expect(
        editMessage("u-author", "conv-1", "msg-1", { content: "Nuevo" }),
      ).rejects.toThrow("The time window to edit this message has expired");
    });
  });

  describe("deleteMessage (Invariante obligatoria de tiempo y soft delete)", () => {
    it("autor borra su mensaje dentro del límite -> soft delete (no borrado físico)", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const recentDate = new Date(Date.now() - 2 * 60_000);
      const originalMsg = buildMockMessage({
        id: "msg-1",
        senderId: "u-author",
        createdAt: recentDate,
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(originalMsg as any);

      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageDeleteForEveryone: true,
        messageDeleteForEveryoneTimeLimitMinutes: 10,
      } as any);

      const deletedDate = new Date();
      vi.mocked(MessageRepository.softDelete).mockResolvedValue({
        ...originalMsg,
        deletedAt: deletedDate,
      } as any);

      const result = await deleteMessage("u-author", "conv-1", "msg-1");

      expect(MessageRepository.softDelete).toHaveBeenCalledWith("msg-1", "u-author");
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.DELETED, {
        conversationId: "conv-1",
        messageId: "msg-1",
        deletedAt: deletedDate,
      });
      expect(result.deletedAt).toBe(deletedDate);
    });

    it("creador de la conversación puede borrar mensajes ajenos por moderación sin límite de tiempo", async () => {
      const mockConv = buildMockConversation({ createdById: "u-creator" });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const veryOldDate = new Date(Date.now() - 1000 * 60_000);
      const otherUserMsg = buildMockMessage({
        id: "msg-1",
        senderId: "u-other-member",
        createdAt: veryOldDate,
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(otherUserMsg as any);

      vi.mocked(MessageRepository.softDelete).mockResolvedValue({
        ...otherUserMsg,
        deletedAt: new Date(),
      } as any);

      const result = await deleteMessage("u-creator", "conv-1", "msg-1");

      expect(MessageRepository.softDelete).toHaveBeenCalledWith("msg-1", "u-creator");
      expect(result.messageId).toBe("msg-1");
    });

    it("usuario que no es ni autor ni creador no puede borrar el mensaje", async () => {
      const mockConv = buildMockConversation({ createdById: "u-creator" });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author" }) as any,
      );

      await expect(
        deleteMessage("u-intruder", "conv-1", "msg-1"),
      ).rejects.toThrow("Only the message author or the conversation creator can delete this message");
    });

    it("autor rechaza si allowMessageDeleteForEveryone es false", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author" }) as any,
      );
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageDeleteForEveryone: false,
      } as any);

      await expect(
        deleteMessage("u-author", "conv-1", "msg-1"),
      ).rejects.toThrow("Deleting messages for everyone is disabled");
    });

    it("autor rechaza si expiró la ventana de tiempo para borrar", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);

      const oldDate = new Date(Date.now() - 60 * 60_000); // 60 minutos atrás
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ senderId: "u-author", createdAt: oldDate }) as any,
      );
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowMessageDeleteForEveryone: true,
        messageDeleteForEveryoneTimeLimitMinutes: 10,
      } as any);

      await expect(
        deleteMessage("u-author", "conv-1", "msg-1"),
      ).rejects.toThrow("The time window to delete this message has expired");
    });
  });
});
