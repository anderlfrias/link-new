import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";

vi.mock("./conversation.service", () => ({
  createConversation: vi.fn(),
  getOrCreateSelfChat: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  setMemberAdminStatus: vi.fn(),
  getGroupSettings: vi.fn(),
  updateGroupSettings: vi.fn(),
  addMembers: vi.fn(),
  removeMember: vi.fn(),
  setConversationPinned: vi.fn(),
  setConversationFavorite: vi.fn(),
  markConversationRead: vi.fn(),
}));

import * as ConversationService from "./conversation.service";
import {
  addMembers,
  create,
  getById,
  getGroupSettings,
  getOrCreateSelf,
  list,
  markRead,
  remove,
  removeMember,
  setFavorite,
  setMemberAdminStatus,
  setPinned,
  update,
  updateGroupSettings,
} from "./conversation.controller";

describe("conversation.controller", () => {
  const mockUser = {
    internalUserId: "u-internal-1",
    roles: ["user"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create: responde 201 con la conversación creada", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      body: { type: "GROUP", name: "Grupo" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.createConversation).mockResolvedValue({ id: "c-1" } as any);

    await create(req, res, next);

    expect(ConversationService.createConversation).toHaveBeenCalledWith(
      "u-internal-1",
      req.body,
      ["user"],
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "c-1" });
    expect(next).not.toHaveBeenCalled();
  });

  it("create: pasa error a next si service lanza", async () => {
    const req = createMockRequest({ user: mockUser as any });
    const res = createMockResponse();
    const next = createMockNext();

    const err = new Error("Validation error");
    vi.mocked(ConversationService.createConversation).mockRejectedValue(err);

    await create(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it("getOrCreateSelf: responde con self chat", async () => {
    const req = createMockRequest({ user: mockUser as any });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.getOrCreateSelfChat).mockResolvedValue({ id: "self-1" } as any);

    await getOrCreateSelf(req, res, next);

    expect(ConversationService.getOrCreateSelfChat).toHaveBeenCalledWith("u-internal-1");
    expect(res.json).toHaveBeenCalledWith({ id: "self-1" });
  });

  it("list: responde con lista de conversaciones", async () => {
    const req = createMockRequest({ user: mockUser as any });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.listConversations).mockResolvedValue([{ id: "c-1" }] as any);

    await list(req, res, next);

    expect(ConversationService.listConversations).toHaveBeenCalledWith("u-internal-1");
    expect(res.json).toHaveBeenCalledWith([{ id: "c-1" }]);
  });

  it("getById: responde con la conversación encontrada", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.getConversation).mockResolvedValue({ id: "c-1" } as any);

    await getById(req, res, next);

    expect(ConversationService.getConversation).toHaveBeenCalledWith("u-internal-1", "c-1");
    expect(res.json).toHaveBeenCalledWith({ id: "c-1" });
  });

  it("update: responde con la conversación actualizada", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
      body: { name: "Nuevo" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.updateConversation).mockResolvedValue({ id: "c-1", name: "Nuevo" } as any);

    await update(req, res, next);

    expect(ConversationService.updateConversation).toHaveBeenCalledWith(
      "u-internal-1",
      "c-1",
      req.body,
      ["user"],
    );
    expect(res.json).toHaveBeenCalledWith({ id: "c-1", name: "Nuevo" });
  });

  it("remove: responde con el resultado de deleteConversation", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.deleteConversation).mockResolvedValue({ conversationId: "c-1" });

    await remove(req, res, next);

    expect(ConversationService.deleteConversation).toHaveBeenCalledWith("u-internal-1", "c-1", ["user"]);
    expect(res.json).toHaveBeenCalledWith({ conversationId: "c-1" });
  });

  it("setMemberAdminStatus: responde con status actualizado", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1", userId: "u-2" },
      body: { isAdmin: true },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.setMemberAdminStatus).mockResolvedValue({
      conversationId: "c-1",
      userId: "u-2",
      isAdmin: true,
    });

    await setMemberAdminStatus(req, res, next);

    expect(ConversationService.setMemberAdminStatus).toHaveBeenCalledWith(
      "u-internal-1",
      "c-1",
      "u-2",
      true,
    );
    expect(res.json).toHaveBeenCalledWith({ conversationId: "c-1", userId: "u-2", isAdmin: true });
  });

  it("getGroupSettings y updateGroupSettings: mapean correctamente", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
      body: { maxGroupMembers: 20 },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.getGroupSettings).mockResolvedValue({ conversationId: "c-1" } as any);
    vi.mocked(ConversationService.updateGroupSettings).mockResolvedValue({ conversationId: "c-1", max: 20 } as any);

    await getGroupSettings(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ conversationId: "c-1" });

    await updateGroupSettings(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ conversationId: "c-1", max: 20 });
  });

  it("addMembers y removeMember: mapean correctamente", async () => {
    const reqAdd = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
      body: { userIds: ["u-3"] },
    });
    const resAdd = createMockResponse();
    const nextAdd = createMockNext();

    vi.mocked(ConversationService.addMembers).mockResolvedValue({ id: "c-1" } as any);
    await addMembers(reqAdd, resAdd, nextAdd);
    expect(resAdd.json).toHaveBeenCalledWith({ id: "c-1" });

    const reqRemove = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1", userId: "u-3" },
    });
    const resRemove = createMockResponse();
    const nextRemove = createMockNext();

    vi.mocked(ConversationService.removeMember).mockResolvedValue({ conversationId: "c-1", userId: "u-3" });
    await removeMember(reqRemove, resRemove, nextRemove);
    expect(resRemove.json).toHaveBeenCalledWith({ conversationId: "c-1", userId: "u-3" });
  });

  it("setPinned, setFavorite y markRead: mapean correctamente", async () => {
    const req = createMockRequest({
      user: mockUser as any,
      params: { id: "c-1" },
      body: { isPinned: true, isFavorite: true, lastReadMessageId: "m-1" },
    });
    const res = createMockResponse();
    const next = createMockNext();

    vi.mocked(ConversationService.setConversationPinned).mockResolvedValue({ isPinned: true } as any);
    vi.mocked(ConversationService.setConversationFavorite).mockResolvedValue({ isFavorite: true } as any);
    vi.mocked(ConversationService.markConversationRead).mockResolvedValue({ lastReadMessageId: "m-1" } as any);

    await setPinned(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ isPinned: true });

    await setFavorite(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ isFavorite: true });

    await markRead(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ lastReadMessageId: "m-1" });
  });
});
