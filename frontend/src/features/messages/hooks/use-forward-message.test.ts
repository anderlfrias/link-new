import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForwardMessage } from "./use-forward-message";
import { useAuth } from "@/providers/auth-provider";
import { forwardMessage } from "@/features/messages/api/messages.api";
import { createConversation, getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/messages/api/messages.api", () => ({
  forwardMessage: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  createConversation: vi.fn(),
  getOrCreateSelfChat: vi.fn(),
}));

describe("useForwardMessage", () => {
  const mockSession = createMockSession({ token: "fwd-token" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });
  });

  it("forwards to conversationId target successfully", async () => {
    vi.mocked(forwardMessage).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", [{ conversationId: "conv-dest" }]);
    });

    expect(forwardMessage).toHaveBeenCalledWith("fwd-token", "conv-dest", "msg-1");
    expect(count).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("forwards to self chat target resolving self chat first", async () => {
    vi.mocked(getOrCreateSelfChat).mockResolvedValueOnce({ id: "self-conv-id" } as any);
    vi.mocked(forwardMessage).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", ["self"]);
    });

    expect(getOrCreateSelfChat).toHaveBeenCalledWith("fwd-token");
    expect(forwardMessage).toHaveBeenCalledWith("fwd-token", "self-conv-id", "msg-1");
    expect(count).toBe(1);
  });

  it("forwards to userId target creating/resolving private chat first", async () => {
    vi.mocked(createConversation).mockResolvedValueOnce({ id: "priv-conv-id" } as any);
    vi.mocked(forwardMessage).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", [{ userId: "user-target" }]);
    });

    expect(createConversation).toHaveBeenCalledWith("fwd-token", {
      type: "PRIVATE",
      memberIds: ["user-target"],
    });
    expect(forwardMessage).toHaveBeenCalledWith("fwd-token", "priv-conv-id", "msg-1");
    expect(count).toBe(1);
  });

  it("handles partial failure across multiple targets", async () => {
    vi.mocked(forwardMessage)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error("Falló"));

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", [
        { conversationId: "conv-ok" },
        { conversationId: "conv-fail" },
      ]);
    });

    expect(count).toBe(1);
    expect(result.current.error).toBe("Se reenvió a 1 de 2 chats. 1 no se pudieron enviar.");
  });

  it("handles total failure", async () => {
    vi.mocked(forwardMessage).mockRejectedValueOnce(new Error("Falló todo"));

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", [{ conversationId: "conv-fail" }]);
    });

    expect(count).toBe(0);
    expect(result.current.error).toBe("No se pudo reenviar el mensaje.");
  });

  it("returns 0 if session is not available", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forward("msg-1", [{ conversationId: "conv-dest" }]);
    });

    expect(count).toBe(0);
    expect(forwardMessage).not.toHaveBeenCalled();
  });

  it("forwardMany forwards multiple messages sequentially", async () => {
    vi.mocked(forwardMessage).mockResolvedValue({} as any);

    const { result } = renderHook(() => useForwardMessage());

    let count = 0;
    await act(async () => {
      count = await result.current.forwardMany(["msg-1", "msg-2"], [{ conversationId: "conv-dest" }]);
    });

    expect(forwardMessage).toHaveBeenCalledWith("fwd-token", "conv-dest", "msg-1");
    expect(forwardMessage).toHaveBeenCalledWith("fwd-token", "conv-dest", "msg-2");
    expect(count).toBe(1);
    expect(result.current.error).toBeNull();
  });
});

