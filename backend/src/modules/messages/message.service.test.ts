import { AuditAction, ConversationType, MessageType } from "@prisma/client";
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
vi.mock("../files/file.repository");
vi.mock("../auth/auth.repository", () => ({
  findUserById: vi.fn(),
}));
vi.mock("../push/push.service", () => ({
  notifyUsers: vi.fn(),
}));
vi.mock("../settings/settings.service");
vi.mock("../audit/audit.service");

import { getConnectedUserIds } from "../../socket/rooms";
import * as ConversationService from "../conversations/conversation.service";
import * as PushService from "../push/push.service";
import * as SettingsService from "../settings/settings.service";
import * as AuditService from "../audit/audit.service";
import * as FileRepository from "../files/file.repository";
import { findUserById } from "../auth/auth.repository";
import * as MessageRepository from "./message.repository";
import { MESSAGE_EVENTS } from "./message.socket";
import {
  deleteMessage,
  editMessage,
  forwardMessage,
  listConversationFiles,
  listMessages,
  sendCallRecordMessage,
  sendMessage,
  toggleReaction,
  votePoll,
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

/// Lo que `buildCanonicalContactContent` guarda para `buildMockContactUser()`.
const CANONICAL_CONTACT = {
  id: "u-contact",
  name: "Contacto Real",
  username: "contacto",
  email: "contacto@real.test",
  avatarFileId: "avatar-1",
};

function buildMockContactUser(overrides: any = {}) {
  return {
    id: "u-contact",
    name: "Contacto Real",
    username: "contacto",
    email: "contacto@real.test",
    avatarFileId: "avatar-1",
    status: "ACTIVE",
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
      vi.mocked(FileRepository.countFilesAttachableBy).mockResolvedValue(1);
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

    it("crea un mensaje tipo CONTACT y lo audita con messageType CONTACT", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      const contactPayload = JSON.stringify({ id: "u-contact", name: "Contacto", email: "contacto@test.com" });
      vi.mocked(findUserById).mockResolvedValue(buildMockContactUser() as any);
      const createdMsg = buildMockMessage({
        type: MessageType.CONTACT,
        content: contactPayload,
      });
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(createdMsg as any);

      const result = await sendMessage("u-1", "conv-1", {
        content: contactPayload,
        type: "CONTACT" as any,
      });

      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.CONTACT,
          content: JSON.stringify(CANONICAL_CONTACT),
        }),
      );
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SEND_MESSAGE,
          metadata: expect.objectContaining({
            messageType: MessageType.CONTACT,
          }),
        }),
      );
      expect(result.type).toBe(MessageType.CONTACT);
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

    describe("tarjetas de contacto", () => {
      beforeEach(() => {
        vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
        vi.mocked(getConnectedUserIds).mockResolvedValue([]);
        vi.mocked(MessageRepository.createMessage).mockResolvedValue(
          buildMockMessage({ type: MessageType.CONTACT }) as any,
        );
      });

      it("se guarda con los datos reales de la cuenta, ignorando nombre, correo y foto del cliente", async () => {
        vi.mocked(findUserById).mockResolvedValue(buildMockContactUser() as any);
        // Nombre y correo de otra persona, con el id del atacante y una foto externa.
        const forged = JSON.stringify({
          id: "u-contact",
          name: "Directora de RR.HH.",
          email: "rrhh@example.org",
          avatarUrl: "https://atacante.example.com/pixel.png",
        });

        await sendMessage("u-1", "conv-1", { content: forged, type: "CONTACT" });

        expect(findUserById).toHaveBeenCalledWith("u-contact");
        expect(MessageRepository.createMessage).toHaveBeenCalledWith(
          expect.objectContaining({ content: JSON.stringify(CANONICAL_CONTACT) }),
        );
        const saved = vi.mocked(MessageRepository.createMessage).mock.calls[0][0].content;
        expect(saved).not.toContain("atacante.example");
        expect(saved).not.toContain("RR.HH.");
      });

      it("rechaza un CONTACT de una cuenta inexistente o desactivada", async () => {
        const content = JSON.stringify({ id: "u-contact" });

        vi.mocked(findUserById).mockResolvedValueOnce(null);
        await expect(sendMessage("u-1", "conv-1", { content, type: "CONTACT" })).rejects.toThrow("Contacto inválido");

        vi.mocked(findUserById).mockResolvedValueOnce(buildMockContactUser({ status: "INACTIVE" }) as any);
        await expect(sendMessage("u-1", "conv-1", { content, type: "CONTACT" })).rejects.toThrow(BadRequestError);

        expect(MessageRepository.createMessage).not.toHaveBeenCalled();
      });

      it("rechaza un CONTACT con JSON inválido o sin id", async () => {
        for (const content of ["no es json", "null", "[]", JSON.stringify({ name: "Sin id" }), JSON.stringify({ id: 5 })]) {
          await expect(sendMessage("u-1", "conv-1", { content, type: "CONTACT" })).rejects.toThrow(
            "Contacto inválido",
          );
        }

        expect(findUserById).not.toHaveBeenCalled();
        expect(MessageRepository.createMessage).not.toHaveBeenCalled();
      });
    });

    it("rechaza con 400 si algún archivo no es adjuntable por el remitente y no crea el mensaje", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ maxFilesPerMessage: 5 } as any);
      // Solo uno de los dos archivos es del remitente o lo ve como adjunto.
      vi.mocked(FileRepository.countFilesAttachableBy).mockResolvedValue(1);

      const attempt = sendMessage("u-1", "conv-1", { content: "", fileIds: ["f-mio", "f-ajeno"] });

      await expect(attempt).rejects.toThrow(BadRequestError);
      // Mismo mensaje que para un id inexistente: no se da un oráculo de ids ajenos.
      await expect(attempt).rejects.toThrow("One or more files do not exist");
      expect(MessageRepository.createMessage).not.toHaveBeenCalled();
    });

    it("valida la lista deduplicada de fileIds contra el usuario actual", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ maxFilesPerMessage: 5 } as any);
      vi.mocked(FileRepository.countFilesAttachableBy).mockResolvedValue(2);
      vi.mocked(getConnectedUserIds).mockResolvedValue(["u-1", "u-2"]);
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(buildMockMessage() as any);

      await sendMessage("u-1", "conv-1", { content: "", fileIds: ["f-1", "f-2", "f-1"] });

      expect(FileRepository.countFilesAttachableBy).toHaveBeenCalledWith("u-1", ["f-1", "f-2"]);
      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: ["f-1", "f-2"] }),
      );
    });
  });

  describe("sendCallRecordMessage", () => {
    it("crea un mensaje CALL y lo audita como SEND_MESSAGE", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue([]);
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(
        buildMockMessage({ type: MessageType.CALL, content: "📞 Llamada de voz perdida" }) as any,
      );

      const result = await sendCallRecordMessage("u-1", "conv-1", "📞 Llamada de voz perdida");

      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          senderId: "u-1",
          type: MessageType.CALL,
          content: "📞 Llamada de voz perdida",
          fileIds: [],
        }),
      );
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SEND_MESSAGE,
          metadata: { messageType: MessageType.CALL, fileCount: 0 },
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.CREATED, expect.objectContaining({ id: "msg-1" }));
      expect(result.type).toBe(MessageType.CALL);
    });

    it("exige membresía en la conversación", async () => {
      vi.mocked(ConversationService.assertMembership).mockRejectedValue(
        new ForbiddenError("You are not a member of this conversation"),
      );

      await expect(sendCallRecordMessage("u-ajeno", "conv-1", "📞 Llamada de voz perdida")).rejects.toThrow(
        ForbiddenError,
      );
      expect(MessageRepository.createMessage).not.toHaveBeenCalled();
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
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.FORWARD_MESSAGE,
          conversationId: "conv-target",
          metadata: { fromConversationId: "conv-source" },
        }),
      );
    });

    it("reenvía adjuntos subidos por otra persona sin pasar por la validación de adjuntables", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(
        buildMockConversation({ id: "conv-target" }) as any,
      );
      // El adjunto lo subió otro usuario: el reenvío ya exige ser miembro del origen.
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({
          id: "msg-source",
          conversationId: "conv-source",
          senderId: "u-2",
          files: [{ fileId: "f-de-otro" }],
        }) as any,
      );
      vi.mocked(getConnectedUserIds).mockResolvedValue([]);
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(buildMockMessage({ id: "msg-fwd" }) as any);

      await forwardMessage("u-1", "conv-target", "msg-source");

      expect(FileRepository.countFilesAttachableBy).not.toHaveBeenCalled();
      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ fileIds: ["f-de-otro"] }),
      );
    });

    it.each([
      { type: MessageType.CALL, label: "un registro de llamada" },
      { type: MessageType.POLL, label: "una encuesta" },
      { type: MessageType.SYSTEM, label: "un mensaje del sistema" },
    ])("rechaza reenviar $label ($type)", async ({ type }) => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({ id: "msg-source", conversationId: "conv-source", type }) as any,
      );

      const attempt = forwardMessage("u-1", "conv-target", "msg-source");

      await expect(attempt).rejects.toThrow(BadRequestError);
      await expect(attempt).rejects.toMatchObject({ code: "message_not_forwardable" });
      expect(MessageRepository.createMessage).not.toHaveBeenCalled();
    });

    it("reenvía un CONTACT reconstruido con los datos actuales de la cuenta", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(
        buildMockMessage({
          id: "msg-source",
          conversationId: "conv-source",
          type: MessageType.CONTACT,
          // Un payload viejo, guardado antes de que el servidor lo armara.
          content: JSON.stringify({ id: "u-contact", name: "Nombre viejo", avatarUrl: "https://atacante.example/p.png" }),
        }) as any,
      );
      vi.mocked(findUserById).mockResolvedValue(buildMockContactUser() as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue([]);
      vi.mocked(MessageRepository.createMessage).mockResolvedValue(buildMockMessage({ id: "msg-fwd" }) as any);

      await forwardMessage("u-1", "conv-target", "msg-source");

      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.CONTACT,
          content: JSON.stringify(CANONICAL_CONTACT),
        }),
      );
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

    it("incluye mensajes eliminados pero con contenido y adjuntos saneados", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const deletedMessage = buildMockMessage({
        id: "m-deleted",
        content: "Texto secreto",
        deletedAt: new Date("2026-01-01T10:10:00Z"),
        deletedById: "u-1",
      });

      vi.mocked(MessageRepository.listMessages).mockResolvedValue([deletedMessage] as any);

      const result = await listMessages("u-1", "conv-1", { limit: 10 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("m-deleted");
      expect(result[0].deletedAt).toEqual(deletedMessage.deletedAt);
      expect(result[0].content).toBe("");
      expect(result[0].files).toEqual([]);
    });

    it("reduce adjuntos al shape público (PublicStoredFile) sin filtrar rutas internas ni checksum (S12)", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsgWithFile = buildMockMessage({
        id: "m-file",
        files: [
          {
            id: "mf-1",
            messageId: "m-file",
            fileId: "f-1",
            file: {
              id: "f-1",
              originalName: "reporte.pdf",
              storedName: "secret-uuid.pdf",
              mimeType: "application/pdf",
              extension: "pdf",
              size: 2048n,
              path: "2026/09/secret-uuid.pdf",
              checksum: "sha256-hash",
              provider: "LOCAL",
              createdById: "u-1",
              createdAt: new Date(),
              deletedAt: null,
            },
          },
        ],
      });
      vi.mocked(MessageRepository.listMessages).mockResolvedValue([mockMsgWithFile] as any);

      const result = await listMessages("u-1", "conv-1", { limit: 10 });

      expect(result).toHaveLength(1);
      const file = result[0].files[0].file as any;
      expect(file.id).toBe("f-1");
      expect(file.originalName).toBe("reporte.pdf");
      expect(file.size).toBe(2048);
      expect(file.url).toMatch(/^\/api\/v1\/files\/f-1\/content\?t=.+/);
      expect(file.deletedAt).toBeNull();
      // Verificamos que NO se expongan campos internos (§5.2, S12)
      expect(file.path).toBeUndefined();
      expect(file.storedName).toBeUndefined();
      expect(file.checksum).toBeUndefined();
      expect(file.provider).toBeUndefined();
    });

    it("pasa query al repositorio y no marca entregado cuando se busca por texto", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMatches = [
        buildMockMessage({ id: "m-match-1", content: "hola mundo", createdAt: new Date("2026-01-01T10:00:00Z") }),
      ];
      vi.mocked(MessageRepository.listMessages).mockResolvedValue(mockMatches as any);

      const result = await listMessages("u-1", "conv-1", { limit: 20, query: "hola" });

      expect(MessageRepository.listMessages).toHaveBeenCalledWith("conv-1", {
        beforeId: undefined,
        limit: 20,
        query: "hola",
      });
      expect(ConversationService.markDelivered).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("m-match-1");
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
          message: { id: "m-1", senderId: "u-1", createdAt: new Date(), type: "TEXT" },
        },
      ];
      vi.mocked(MessageRepository.listFiles).mockResolvedValue(mockEntries as any);

      const files = await listConversationFiles("u-1", "conv-1", { limit: 20 });

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe("f-1");
      expect(files[0].messageId).toBe("m-1");
      expect(files[0].senderId).toBe("u-1");
      expect(files[0].size).toBe(1024);
      expect(files[0].messageType).toBe("TEXT");
    });

    it("propaga messageType 'STICKER' para que el cliente distinga un sticker de una imagen cualquiera", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(buildMockConversation() as any);

      const mockEntries = [
        {
          file: {
            id: "f-sticker",
            path: "uploads/sticker.gif",
            originalName: "sticker-abc.gif",
            mimeType: "image/gif",
            size: 2048n,
            createdAt: new Date(),
          },
          message: { id: "m-sticker", senderId: "u-1", createdAt: new Date(), type: "STICKER" },
        },
      ];
      vi.mocked(MessageRepository.listFiles).mockResolvedValue(mockEntries as any);

      const files = await listConversationFiles("u-1", "conv-1", { limit: 20 });

      expect(files[0].messageType).toBe("STICKER");
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
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.EDIT_MESSAGE,
          conversationId: "conv-1",
          messageId: "msg-1",
        }),
      );
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
      expect(AuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DELETE_MESSAGE,
          conversationId: "conv-1",
          messageId: "msg-1",
          metadata: { deletedOwnMessage: true },
        }),
      );
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

  describe("toggleReaction", () => {
    it("agrega una reacción cuando el usuario no tenía ninguna y emite evento con action 'added'", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage();
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);
      vi.mocked(MessageRepository.findUserReaction).mockResolvedValue(null);
      vi.mocked(MessageRepository.addReaction).mockResolvedValue({
        id: "react-1",
        messageId: "msg-1",
        userId: "u-1",
        emoji: "👍",
        createdAt: new Date(),
        user: { id: "u-1", name: "User 1" },
      } as any);
      vi.mocked(MessageRepository.getMessageReactions).mockResolvedValue([
        {
          id: "react-1",
          messageId: "msg-1",
          userId: "u-1",
          emoji: "👍",
          createdAt: new Date(),
          user: { id: "u-1", name: "User 1" },
        },
      ] as any);

      const result = await toggleReaction("u-1", "conv-1", "msg-1", "👍");

      expect(ConversationService.assertMembership).toHaveBeenCalledWith("conv-1", "u-1");
      expect(MessageRepository.findUserReaction).toHaveBeenCalledWith("msg-1", "u-1");
      expect(MessageRepository.addReaction).toHaveBeenCalledWith("msg-1", "u-1", "👍");
      expect(mockTo).toHaveBeenCalledWith("conversation:conv-1");
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.REACTION_UPDATED, {
        conversationId: "conv-1",
        messageId: "msg-1",
        reactions: [
          expect.objectContaining({
            id: "react-1",
            messageId: "msg-1",
            userId: "u-1",
            userName: "User 1",
            emoji: "👍",
          }),
        ],
        userId: "u-1",
        emoji: "👍",
        action: "added",
      });
      expect(result.action).toBe("added");
      expect(result.reactions).toHaveLength(1);
    });

    it("quita la reacción cuando el usuario ya tenía ese mismo emoji (toggle off)", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage();
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);
      vi.mocked(MessageRepository.findUserReaction).mockResolvedValue({
        id: "react-1",
        messageId: "msg-1",
        userId: "u-1",
        emoji: "👍",
      } as any);
      vi.mocked(MessageRepository.removeReaction).mockResolvedValue({} as any);
      vi.mocked(MessageRepository.getMessageReactions).mockResolvedValue([]);

      const result = await toggleReaction("u-1", "conv-1", "msg-1", "👍");

      expect(MessageRepository.removeReaction).toHaveBeenCalledWith("msg-1", "u-1");
      expect(mockEmit).toHaveBeenCalledWith(
        MESSAGE_EVENTS.REACTION_UPDATED,
        expect.objectContaining({
          action: "removed",
          reactions: [],
        }),
      );
      expect(result.action).toBe("removed");
      expect(result.reactions).toEqual([]);
    });

    it("reemplaza el emoji anterior cuando el usuario elige uno diferente (solo 1 reacción por usuario)", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage();
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);
      vi.mocked(MessageRepository.findUserReaction).mockResolvedValue({
        id: "react-1",
        messageId: "msg-1",
        userId: "u-1",
        emoji: "👍",
      } as any);
      vi.mocked(MessageRepository.updateReaction).mockResolvedValue({
        id: "react-1",
        messageId: "msg-1",
        userId: "u-1",
        emoji: "❤️",
        createdAt: new Date(),
      } as any);
      vi.mocked(MessageRepository.getMessageReactions).mockResolvedValue([
        {
          id: "react-1",
          messageId: "msg-1",
          userId: "u-1",
          emoji: "❤️",
          createdAt: new Date(),
          user: { id: "u-1", name: "User 1" },
        },
      ] as any);

      const result = await toggleReaction("u-1", "conv-1", "msg-1", "❤️");

      expect(MessageRepository.updateReaction).toHaveBeenCalledWith("msg-1", "u-1", "❤️");
      expect(mockEmit).toHaveBeenCalledWith(
        MESSAGE_EVENTS.REACTION_UPDATED,
        expect.objectContaining({
          action: "updated",
          emoji: "❤️",
          reactions: [expect.objectContaining({ emoji: "❤️" })],
        }),
      );
      expect(result.action).toBe("updated");
      expect(result.reactions[0].emoji).toBe("❤️");
    });

    it("lanza BadRequestError si el emoji está vacío o sólo contiene espacios", async () => {
      await expect(toggleReaction("u-1", "conv-1", "msg-1", "")).rejects.toThrow(BadRequestError);
      await expect(toggleReaction("u-1", "conv-1", "msg-1", "   ")).rejects.toThrow(BadRequestError);
    });

    it("lanza NotFoundError si el mensaje no pertenece a la conversación o no existe", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(MessageRepository.findById).mockResolvedValue(null);

      await expect(toggleReaction("u-1", "conv-1", "msg-nonexistent", "👍")).rejects.toThrow(NotFoundError);
    });
  });

  describe("sendMessage con POLL", () => {
    it("crea exitosamente una encuesta en una conversación GROUP", async () => {
      const mockConv = buildMockConversation({ type: ConversationType.GROUP });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);
      vi.mocked(getConnectedUserIds).mockResolvedValue(["u-1", "u-2"]);

      const mockPoll = {
        id: "poll-1",
        messageId: "msg-poll-1",
        question: "¿Qué día nos reunimos?",
        allowMultiple: false,
        options: [
          { id: "opt-1", pollId: "poll-1", text: "Lunes", order: 0, votes: [] },
          { id: "opt-2", pollId: "poll-1", text: "Martes", order: 1, votes: [] },
        ],
        createdAt: new Date(),
      };

      const mockCreated = buildMockMessage({
        id: "msg-poll-1",
        type: MessageType.POLL,
        content: "¿Qué día nos reunimos?",
        poll: mockPoll,
      });

      vi.mocked(MessageRepository.createMessage).mockResolvedValue(mockCreated as any);

      const result = await sendMessage("u-1", "conv-1", {
        type: "POLL",
        poll: {
          question: "¿Qué día nos reunimos?",
          options: ["Lunes", "Martes"],
          allowMultiple: false,
        },
      });

      expect(MessageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.POLL,
          content: "¿Qué día nos reunimos?",
          poll: {
            question: "¿Qué día nos reunimos?",
            options: ["Lunes", "Martes"],
            allowMultiple: false,
          },
        }),
      );
      expect(result.poll?.question).toBe("¿Qué día nos reunimos?");
      expect(result.poll?.options).toHaveLength(2);
      expect(mockEmit).toHaveBeenCalledWith(MESSAGE_EVENTS.CREATED, expect.objectContaining({ id: "msg-poll-1" }));
    });

    it("rechaza la creación de una encuesta si la conversación es PRIVATE", async () => {
      const mockConv = buildMockConversation({ type: ConversationType.PRIVATE });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      await expect(
        sendMessage("u-1", "conv-1", {
          type: "POLL",
          poll: {
            question: "¿Pregunta en privado?",
            options: ["A", "B"],
          },
        }),
      ).rejects.toThrow("Las encuestas solo están permitidas en chats grupales");
    });

    it("rechaza la creación de una encuesta si la conversación es SELF", async () => {
      const mockConv = buildMockConversation({ type: ConversationType.SELF });
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      await expect(
        sendMessage("u-1", "conv-1", {
          type: "POLL",
          poll: {
            question: "¿Pregunta en self?",
            options: ["A", "B"],
          },
        }),
      ).rejects.toThrow("Las encuestas solo están permitidas en chats grupales");
    });
  });

  describe("votePoll", () => {
    it("vota exitosamente en una encuesta y emite POLL_VOTED", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage({
        id: "msg-poll-1",
        type: MessageType.POLL,
        poll: {
          id: "poll-1",
          allowMultiple: false,
          options: [
            { id: "opt-1", pollId: "poll-1", text: "Lunes" },
            { id: "opt-2", pollId: "poll-1", text: "Martes" },
          ],
        },
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);

      const updatedPollMock = {
        id: "poll-1",
        messageId: "msg-poll-1",
        question: "¿Qué día?",
        allowMultiple: false,
        options: [
          {
            id: "opt-1",
            pollId: "poll-1",
            text: "Lunes",
            order: 0,
            votes: [{ id: "vote-1", optionId: "opt-1", userId: "u-1", user: { name: "User 1" }, createdAt: new Date() }],
          },
          { id: "opt-2", pollId: "poll-1", text: "Martes", order: 1, votes: [] },
        ],
        createdAt: new Date(),
      };

      vi.mocked(MessageRepository.togglePollVote).mockResolvedValue({
        updatedPoll: updatedPollMock,
        action: "added",
      } as any);

      const result = await votePoll("u-1", "conv-1", "msg-poll-1", "opt-1");

      expect(MessageRepository.togglePollVote).toHaveBeenCalledWith("poll-1", "opt-1", "u-1", false);
      expect(mockEmit).toHaveBeenCalledWith(
        MESSAGE_EVENTS.POLL_VOTED,
        expect.objectContaining({
          conversationId: "conv-1",
          messageId: "msg-poll-1",
          action: "added",
          optionId: "opt-1",
        }),
      );
      expect(result.action).toBe("added");
      expect(result.poll?.options[0].voteCount).toBe(1);
    });

    it("lanza NotFoundError si la opción no pertenece a la encuesta", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage({
        id: "msg-poll-1",
        type: MessageType.POLL,
        poll: {
          id: "poll-1",
          allowMultiple: false,
          options: [{ id: "opt-1", pollId: "poll-1", text: "Lunes" }],
        },
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);

      await expect(votePoll("u-1", "conv-1", "msg-poll-1", "opt-nonexistent")).rejects.toThrow(NotFoundError);
    });

    it("lanza BadRequestError si el mensaje no es una encuesta válida", async () => {
      const mockConv = buildMockConversation();
      vi.mocked(ConversationService.assertMembership).mockResolvedValue(mockConv as any);

      const mockMsg = buildMockMessage({
        id: "msg-text-1",
        type: MessageType.TEXT,
      });
      vi.mocked(MessageRepository.findById).mockResolvedValue(mockMsg as any);

      await expect(votePoll("u-1", "conv-1", "msg-text-1", "opt-1")).rejects.toThrow(BadRequestError);
    });
  });
});
