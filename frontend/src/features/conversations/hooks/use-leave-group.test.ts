import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLeaveGroup } from "./use-leave-group";
import { useAuth } from "@/providers/auth-provider";
import { removeMember } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  removeMember: vi.fn(),
}));

describe("useLeaveGroup", () => {
  const mockSession = createMockSession({
    token: "leave-tok",
    user: { internalUserId: "my-user-uuid" } as any,
  });

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

  it("leaves group successfully by calling removeMember with user's own internalUserId", async () => {
    vi.mocked(removeMember).mockResolvedValueOnce({
      conversationId: "group-conv-1",
      userId: "my-user-uuid",
    });

    const { result } = renderHook(() => useLeaveGroup());

    let ok = false;
    await act(async () => {
      ok = await result.current.leave("group-conv-1");
    });

    expect(ok).toBe(true);
    expect(removeMember).toHaveBeenCalledWith("leave-tok", "group-conv-1", "my-user-uuid");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles leave group failure", async () => {
    vi.mocked(removeMember).mockRejectedValueOnce(new Error("No puedes abandonar el grupo"));

    const { result } = renderHook(() => useLeaveGroup());

    let ok = true;
    await act(async () => {
      ok = await result.current.leave("group-conv-1");
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("No puedes abandonar el grupo");
  });

  it("returns false if no session is active", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useLeaveGroup());

    let ok = true;
    await act(async () => {
      ok = await result.current.leave("group-conv-1");
    });

    expect(ok).toBe(false);
    expect(removeMember).not.toHaveBeenCalled();
  });
});
