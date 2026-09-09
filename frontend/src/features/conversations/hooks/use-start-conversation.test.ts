import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStartConversation } from "./use-start-conversation";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { createConversation } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  createConversation: vi.fn(),
}));

describe("useStartConversation", () => {
  const mockSession = createMockSession({ token: "start-tok" });
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as any);
  });

  it("creates private conversation and navigates to it", async () => {
    const mockCreated = { id: "conv-priv-1", type: "PRIVATE" };
    vi.mocked(createConversation).mockResolvedValueOnce(mockCreated as any);

    const { result } = renderHook(() => useStartConversation());

    let res: any;
    await act(async () => {
      res = await result.current.startWithUser("user-target");
    });

    expect(createConversation).toHaveBeenCalledWith("start-tok", {
      type: "PRIVATE",
      memberIds: ["user-target"],
    });
    expect(mockPush).toHaveBeenCalledWith("/conversations/conv-priv-1");
    expect(res).toEqual(mockCreated);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles conversation creation failure", async () => {
    vi.mocked(createConversation).mockRejectedValueOnce(new Error("Usuario bloqueado"));

    const { result } = renderHook(() => useStartConversation());

    let res: any;
    await act(async () => {
      res = await result.current.startWithUser("user-target");
    });

    expect(res).toBeNull();
    expect(result.current.error).toBe("Usuario bloqueado");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("returns null if no session is active", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useStartConversation());

    let res: any;
    await act(async () => {
      res = await result.current.startWithUser("user-target");
    });

    expect(res).toBeNull();
    expect(createConversation).not.toHaveBeenCalled();
  });
});
