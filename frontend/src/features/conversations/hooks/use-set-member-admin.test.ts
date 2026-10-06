import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSetMemberAdmin } from "./use-set-member-admin";
import { useAuth } from "@/providers/auth-provider";
import { setMemberAdmin } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  setMemberAdmin: vi.fn(),
}));

describe("useSetMemberAdmin", () => {
  const mockSession = createMockSession({ token: "admin-tok" });

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

  it("sets member as admin successfully", async () => {
    vi.mocked(setMemberAdmin).mockResolvedValueOnce({ conversationId: "conv-1", userId: "user-2", isAdmin: true });

    const { result } = renderHook(() => useSetMemberAdmin("conv-1"));

    let ok = false;
    await act(async () => {
      ok = await result.current.setAdmin("user-2", true);
    });

    expect(ok).toBe(true);
    expect(setMemberAdmin).toHaveBeenCalledWith("admin-tok", "conv-1", "user-2", true);
    expect(result.current.pendingUserId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("demotes member from admin successfully", async () => {
    vi.mocked(setMemberAdmin).mockResolvedValueOnce({ conversationId: "conv-1", userId: "user-2", isAdmin: false });

    const { result } = renderHook(() => useSetMemberAdmin("conv-1"));

    let ok = false;
    await act(async () => {
      ok = await result.current.setAdmin("user-2", false);
    });

    expect(ok).toBe(true);
    expect(setMemberAdmin).toHaveBeenCalledWith("admin-tok", "conv-1", "user-2", false);
  });

  it("handles failure when setting admin", async () => {
    vi.mocked(setMemberAdmin).mockRejectedValueOnce(new Error("Solo admins pueden modificar roles"));

    const { result } = renderHook(() => useSetMemberAdmin("conv-1"));

    let ok = true;
    await act(async () => {
      ok = await result.current.setAdmin("user-2", true);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Solo admins pueden modificar roles");
    expect(result.current.pendingUserId).toBeNull();
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

    const { result } = renderHook(() => useSetMemberAdmin("conv-1"));

    let ok = true;
    await act(async () => {
      ok = await result.current.setAdmin("user-2", true);
    });

    expect(ok).toBe(false);
    expect(setMemberAdmin).not.toHaveBeenCalled();
  });
});
