import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./message.service", () => ({
  sendMessage: vi.fn(),
  forwardMessage: vi.fn(),
  listMessages: vi.fn(),
  listConversationFiles: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

import * as MessageService from "./message.service";
import { create, forward, list, listFiles, remove, update } from "./message.controller";

describe("message.controller", () => {
  const mockUser = {
    internalUserId: "u-internal-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("responde 201 con el mensaje creado", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-1" },
        body: { content: "Hola mundo" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.sendMessage).mockResolvedValue({ id: "msg-1" } as any);

      await create(req, res, next);

      expect(MessageService.sendMessage).toHaveBeenCalledWith("u-internal-1", "conv-1", req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: "msg-1" });
      expect(next).not.toHaveBeenCalled();
    });

    it("pasa error a next si falla el service", async () => {
      const req = createMockRequest({ user: mockUser as any, params: { conversationId: "conv-1" } });
      const res = createMockResponse();
      const next = createMockNext();

      const err = new Error("Send failed");
      vi.mocked(MessageService.sendMessage).mockRejectedValue(err);

      await create(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe("forward", () => {
    it("responde 201 con el mensaje reenviado", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-target" },
        body: { messageId: "msg-orig" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.forwardMessage).mockResolvedValue({ id: "msg-fwd" } as any);

      await forward(req, res, next);

      expect(MessageService.forwardMessage).toHaveBeenCalledWith("u-internal-1", "conv-target", "msg-orig");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: "msg-fwd" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("parsea query params before y limit y responde con mensajes", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-1" },
        query: { before: "msg-cursor", limit: "30" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.listMessages).mockResolvedValue([{ id: "m-1" }] as any);

      await list(req, res, next);

      expect(MessageService.listMessages).toHaveBeenCalledWith("u-internal-1", "conv-1", {
        beforeId: "msg-cursor",
        limit: 30,
      });
      expect(res.json).toHaveBeenCalledWith([{ id: "m-1" }]);
    });
  });

  describe("listFiles", () => {
    it("parsea query params y responde con los archivos", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-1" },
        query: { limit: "10" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.listConversationFiles).mockResolvedValue([{ id: "file-1" }] as any);

      await listFiles(req, res, next);

      expect(MessageService.listConversationFiles).toHaveBeenCalledWith("u-internal-1", "conv-1", {
        beforeId: undefined,
        limit: 10,
      });
      expect(res.json).toHaveBeenCalledWith([{ id: "file-1" }]);
    });
  });

  describe("update", () => {
    it("edita el mensaje y responde con el mensaje actualizado", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-1", id: "msg-1" },
        body: { content: "Editado" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.editMessage).mockResolvedValue({ id: "msg-1", content: "Editado" } as any);

      await update(req, res, next);

      expect(MessageService.editMessage).toHaveBeenCalledWith("u-internal-1", "conv-1", "msg-1", req.body);
      expect(res.json).toHaveBeenCalledWith({ id: "msg-1", content: "Editado" });
    });
  });

  describe("remove", () => {
    it("borra el mensaje y responde con el resultado", async () => {
      const req = createMockRequest({
        user: mockUser as any,
        params: { conversationId: "conv-1", id: "msg-1" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      vi.mocked(MessageService.deleteMessage).mockResolvedValue({
        conversationId: "conv-1",
        messageId: "msg-1",
        deletedAt: new Date(),
      });

      await remove(req, res, next);

      expect(MessageService.deleteMessage).toHaveBeenCalledWith("u-internal-1", "conv-1", "msg-1");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: "conv-1", messageId: "msg-1" }),
      );
    });
  });
});
