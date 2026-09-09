import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listConversations,
  getConversation,
  createConversation,
  getOrCreateSelfChat,
  updateConversation,
  addMembers,
  removeMember,
  deleteConversation,
  setMemberAdmin,
  getConversationSettings,
  updateConversationSettings,
  setConversationPinned,
  setConversationFavorite,
  markConversationRead,
} from "./conversations.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("conversations.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listConversations sends GET to /v1/conversations", async () => {
    const mockList = [{ id: "c-1", type: "PRIVATE" }];
    vi.mocked(apiRequest).mockResolvedValueOnce(mockList);

    const res = await listConversations("tok-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations", { token: "tok-1" });
    expect(res).toBe(mockList);
  });

  it("getConversation sends GET to /v1/conversations/:id", async () => {
    const mockConv = { id: "c-1" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockConv);

    const res = await getConversation("tok-1", "c-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1", { token: "tok-1" });
    expect(res).toBe(mockConv);
  });

  it("createConversation sends POST to /v1/conversations with body", async () => {
    const input = { type: "GROUP" as const, name: "Guardia", memberIds: ["u-1", "u-2"] };
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "c-new" });

    await createConversation("tok-1", input);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations", {
      method: "POST",
      token: "tok-1",
      body: input,
    });
  });

  it("getOrCreateSelfChat sends POST to /v1/conversations/self", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "c-self", isSelf: true });

    const res = await getOrCreateSelfChat("tok-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/self", {
      method: "POST",
      token: "tok-1",
    });
    expect(res).toEqual({ id: "c-self", isSelf: true });
  });

  it("updateConversation sends PATCH to /v1/conversations/:id with input", async () => {
    const input = { name: "Nuevo Título" };
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "c-1", name: "Nuevo Título" });

    await updateConversation("tok-1", "c-1", input);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1", {
      method: "PATCH",
      token: "tok-1",
      body: input,
    });
  });

  it("addMembers sends POST to /v1/conversations/:id/members", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "c-1" });

    await addMembers("tok-1", "c-1", ["u-3"]);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/members", {
      method: "POST",
      token: "tok-1",
      body: { userIds: ["u-3"] },
    });
  });

  it("removeMember sends DELETE to /v1/conversations/:id/members/:userId", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ conversationId: "c-1", userId: "u-3" });

    await removeMember("tok-1", "c-1", "u-3");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/members/u-3", {
      method: "DELETE",
      token: "tok-1",
    });
  });

  it("deleteConversation sends DELETE to /v1/conversations/:id", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ conversationId: "c-1" });

    await deleteConversation("tok-1", "c-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1", {
      method: "DELETE",
      token: "tok-1",
    });
  });

  it("setMemberAdmin sends PATCH to /v1/conversations/:id/members/:userId/admin", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ conversationId: "c-1", userId: "u-3", isAdmin: true });

    await setMemberAdmin("tok-1", "c-1", "u-3", true);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/members/u-3/admin", {
      method: "PATCH",
      token: "tok-1",
      body: { isAdmin: true },
    });
  });

  it("getConversationSettings and updateConversationSettings call /v1/conversations/:id/settings", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ maxGroupMembers: 100 });
    await getConversationSettings("tok-1", "c-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/settings", { token: "tok-1" });

    vi.mocked(apiRequest).mockResolvedValueOnce({ maxGroupMembers: 150 });
    await updateConversationSettings("tok-1", "c-1", { maxGroupMembers: 150 });
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/settings", {
      method: "PATCH",
      token: "tok-1",
      body: { maxGroupMembers: 150 },
    });
  });

  it("setConversationPinned and setConversationFavorite call /pin and /favorite", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ isPinned: true });
    await setConversationPinned("tok-1", "c-1", true);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/pin", {
      method: "PATCH",
      token: "tok-1",
      body: { isPinned: true },
    });

    vi.mocked(apiRequest).mockResolvedValueOnce({ isFavorite: true });
    await setConversationFavorite("tok-1", "c-1", true);
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/favorite", {
      method: "PATCH",
      token: "tok-1",
      body: { isFavorite: true },
    });
  });

  it("markConversationRead sends POST to /v1/conversations/:id/read with optional messageId", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await markConversationRead("tok-1", "c-1");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/read", {
      method: "POST",
      token: "tok-1",
      body: {},
    });

    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await markConversationRead("tok-1", "c-1", "msg-123");
    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/c-1/read", {
      method: "POST",
      token: "tok-1",
      body: { lastReadMessageId: "msg-123" },
    });
  });
});
