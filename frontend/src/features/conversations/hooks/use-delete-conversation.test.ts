import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeleteConversation } from "./use-delete-conversation";
import { useAuth } from "@/providers/auth-provider";
import { deleteConversation } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  deleteConversation: vi.fn(),
}));

describe("useDeleteConversation", () => {
  const mockSession = createMockSession({ token: "del-tok" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });
  });

  it("deletes conversation successfully", async () => {
    vi.mocked(deleteConversation).mockResolvedValueOnce({ conversationId: "conv-1" });

    const { result } = renderHook(() => useDeleteConversation());

    let ok = false;
    await act(async () => {
      ok = await result.current.remove("conv-1");
    });

    expect(ok).toBe(true);
    expect(deleteConversation).toHaveBeenCalledWith("del-tok", "conv-1");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles deletion error", async () => {
    vi.mocked(deleteConversation).mockRejectedValueOnce(new Error("No permitido"));

    const { result } = renderHook(() => useDeleteConversation());

    let ok = true;
    await act(async () => {
      ok = await result.current.remove("conv-1");
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("No permitido");
  });

  it("returns false if no session is present", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useDeleteConversation());

    let ok = true;
    await act(async () => {
      ok = await result.current.remove("conv-1");
    });

    expect(ok).toBe(false);
    expect(deleteConversation).not.toHaveBeenCalled();
  });
});
