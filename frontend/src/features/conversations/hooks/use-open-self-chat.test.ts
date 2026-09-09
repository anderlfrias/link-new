import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpenSelfChat } from "./use-open-self-chat";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  getOrCreateSelfChat: vi.fn(),
}));

describe("useOpenSelfChat", () => {
  const mockSession = createMockSession({ token: "self-tok" });
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

  it("opens self chat successfully and navigates to it", async () => {
    const mockSelfChat = { id: "conv-self-1", type: "SELF" };
    vi.mocked(getOrCreateSelfChat).mockResolvedValueOnce(mockSelfChat as any);

    const { result } = renderHook(() => useOpenSelfChat());

    await act(async () => {
      await result.current.open();
    });

    expect(getOrCreateSelfChat).toHaveBeenCalledWith("self-tok");
    expect(mockPush).toHaveBeenCalledWith("/conversations/conv-self-1");
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles self chat open failure", async () => {
    vi.mocked(getOrCreateSelfChat).mockRejectedValueOnce(new Error("Error interno"));

    const { result } = renderHook(() => useOpenSelfChat());

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.error).toBe("Error interno");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does nothing when session is not available", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useOpenSelfChat());

    await act(async () => {
      await result.current.open();
    });

    expect(getOrCreateSelfChat).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
