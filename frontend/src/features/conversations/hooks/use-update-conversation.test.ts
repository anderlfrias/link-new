import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateConversation } from "./use-update-conversation";
import { useAuth } from "@/providers/auth-provider";
import { updateConversation } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  updateConversation: vi.fn(),
}));

describe("useUpdateConversation", () => {
  const mockSession = createMockSession({ token: "upd-token" });

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

  it("updates conversation successfully", async () => {
    vi.mocked(updateConversation).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useUpdateConversation("conv-1"));

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.update({ name: "Updated Group" });
    });

    expect(ok).toBe(true);
    expect(updateConversation).toHaveBeenCalledWith("upd-token", "conv-1", { name: "Updated Group" });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles update failure and sets error message", async () => {
    vi.mocked(updateConversation).mockRejectedValueOnce(new Error("Permiso denegado"));

    const { result } = renderHook(() => useUpdateConversation("conv-1"));

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.update({ name: "New Name" });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Permiso denegado");
  });

  it("returns false if session is missing", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    const { result } = renderHook(() => useUpdateConversation("conv-1"));

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.update({ name: "New Name" });
    });

    expect(ok).toBe(false);
    expect(updateConversation).not.toHaveBeenCalled();
  });
});
