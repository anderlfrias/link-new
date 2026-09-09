import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listMessages,
  listConversationFiles,
  sendMessage,
  forwardMessage,
  editMessage,
  deleteMessage,
} from "./messages.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("messages.api", () => {
  const token = "test-token";
  const conversationId = "conv-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMessages sends GET to /v1/conversations/:id/messages with query", async () => {
    const mockMessages = [{ id: "msg-1", content: "Hola" }];
    vi.mocked(apiRequest).mockResolvedValueOnce(mockMessages);

    const res = await listMessages(token, conversationId, { before: "2026-09-09T00:00:00Z", limit: 30 });

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages", {
      token: "test-token",
      query: { before: "2026-09-09T00:00:00Z", limit: 30 },
    });
    expect(res).toEqual(mockMessages);
  });

  it("listMessages uses empty query defaults", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([]);

    await listMessages(token, conversationId);

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages", {
      token: "test-token",
      query: { before: undefined, limit: undefined },
    });
  });

  it("listConversationFiles sends GET to /v1/conversations/:id/messages/files", async () => {
    const mockFiles = [{ id: "file-1", name: "doc.pdf" }];
    vi.mocked(apiRequest).mockResolvedValueOnce(mockFiles);

    const res = await listConversationFiles(token, conversationId, { limit: 20 });

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages/files", {
      token: "test-token",
      query: { before: undefined, limit: 20 },
    });
    expect(res).toEqual(mockFiles);
  });

  it("sendMessage sends POST to /v1/conversations/:id/messages with body", async () => {
    const input = { content: "Mensaje nuevo" };
    const mockCreated = { id: "msg-2", content: "Mensaje nuevo" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockCreated);

    const res = await sendMessage(token, conversationId, input);

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages", {
      method: "POST",
      token: "test-token",
      body: input,
    });
    expect(res).toEqual(mockCreated);
  });

  it("forwardMessage sends POST to /v1/conversations/:id/messages/forward with messageId", async () => {
    const mockForwarded = { id: "msg-3", forwardOfId: "msg-original" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockForwarded);

    const res = await forwardMessage(token, conversationId, "msg-original");

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages/forward", {
      method: "POST",
      token: "test-token",
      body: { messageId: "msg-original" },
    });
    expect(res).toEqual(mockForwarded);
  });

  it("editMessage sends PATCH to /v1/conversations/:id/messages/:messageId", async () => {
    const input = { content: "Contenido editado" };
    const mockEdited = { id: "msg-1", content: "Contenido editado" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockEdited);

    const res = await editMessage(token, conversationId, "msg-1", input);

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages/msg-1", {
      method: "PATCH",
      token: "test-token",
      body: input,
    });
    expect(res).toEqual(mockEdited);
  });

  it("deleteMessage sends DELETE to /v1/conversations/:id/messages/:messageId", async () => {
    const mockDeleted = { conversationId, messageId: "msg-1", deletedAt: "2026-09-09T10:00:00Z" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockDeleted);

    const res = await deleteMessage(token, conversationId, "msg-1");

    expect(apiRequest).toHaveBeenCalledWith("/v1/conversations/conv-123/messages/msg-1", {
      method: "DELETE",
      token: "test-token",
    });
    expect(res).toEqual(mockDeleted);
  });
});
