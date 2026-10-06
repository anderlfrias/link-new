import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAddMembers } from "./use-add-members";
import { useAuth } from "@/providers/auth-provider";
import { addMembers as addMembersApi } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  addMembers: vi.fn(),
}));

describe("useAddMembers", () => {
  const mockSession = createMockSession({ token: "add-tok" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });
  });

  it("adds members successfully", async () => {
    vi.mocked(addMembersApi).mockResolvedValueOnce({} as any);

    const { result } = renderHook(() => useAddMembers("conv-1"));

    let ok = false;
    await act(async () => {
      ok = await result.current.addMembers(["user-2", "user-3"]);
    });

    expect(ok).toBe(true);
    expect(addMembersApi).toHaveBeenCalledWith("add-tok", "conv-1", ["user-2", "user-3"]);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles failure when adding members", async () => {
    vi.mocked(addMembersApi).mockRejectedValueOnce(new Error("Límite de miembros superado"));

    const { result } = renderHook(() => useAddMembers("conv-1"));

    let ok = true;
    await act(async () => {
      ok = await result.current.addMembers(["user-2"]);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Límite de miembros superado");
  });

  it("returns false if no session is present", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const { result } = renderHook(() => useAddMembers("conv-1"));

    let ok = true;
    await act(async () => {
      ok = await result.current.addMembers(["user-2"]);
    });

    expect(ok).toBe(false);
    expect(addMembersApi).not.toHaveBeenCalled();
  });
});
