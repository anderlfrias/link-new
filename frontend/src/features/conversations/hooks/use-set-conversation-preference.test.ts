import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSetConversationPreference } from "./use-set-conversation-preference";
import { useAuth } from "@/providers/auth-provider";
import {
  setConversationFavorite,
  setConversationPinned,
} from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  setConversationPinned: vi.fn(),
  setConversationFavorite: vi.fn(),
}));

describe("useSetConversationPreference", () => {
  const mockSession = createMockSession({ token: "pref-tok" });

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

  describe("setPinned", () => {
    it("pins conversation successfully", async () => {
      vi.mocked(setConversationPinned).mockResolvedValueOnce({} as any);

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = false;
      await act(async () => {
        ok = await result.current.setPinned("conv-1", true);
      });

      expect(ok).toBe(true);
      expect(setConversationPinned).toHaveBeenCalledWith("pref-tok", "conv-1", true);
      expect(result.current.pendingId).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("unpins conversation successfully", async () => {
      vi.mocked(setConversationPinned).mockResolvedValueOnce({} as any);

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = false;
      await act(async () => {
        ok = await result.current.setPinned("conv-1", false);
      });

      expect(ok).toBe(true);
      expect(setConversationPinned).toHaveBeenCalledWith("pref-tok", "conv-1", false);
    });

    it("handles pin failure", async () => {
      vi.mocked(setConversationPinned).mockRejectedValueOnce(new Error("Límite de chats fijados"));

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = true;
      await act(async () => {
        ok = await result.current.setPinned("conv-1", true);
      });

      expect(ok).toBe(false);
      expect(result.current.error).toBe("Límite de chats fijados");
      expect(result.current.pendingId).toBeNull();
    });

    it("returns false if no session is active", async () => {
      vi.mocked(useAuth).mockReturnValue({
        session: null,
        status: "unauthenticated",
        login: vi.fn(),
        logout: vi.fn(),
        updateSessionUser: vi.fn(),
        expireSession: vi.fn(),
        completePasswordChange: vi.fn(),
      });

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = true;
      await act(async () => {
        ok = await result.current.setPinned("conv-1", true);
      });

      expect(ok).toBe(false);
      expect(setConversationPinned).not.toHaveBeenCalled();
    });
  });

  describe("setFavorite", () => {
    it("favorites conversation successfully", async () => {
      vi.mocked(setConversationFavorite).mockResolvedValueOnce({} as any);

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = false;
      await act(async () => {
        ok = await result.current.setFavorite("conv-1", true);
      });

      expect(ok).toBe(true);
      expect(setConversationFavorite).toHaveBeenCalledWith("pref-tok", "conv-1", true);
      expect(result.current.pendingId).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("unfavorites conversation successfully", async () => {
      vi.mocked(setConversationFavorite).mockResolvedValueOnce({} as any);

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = false;
      await act(async () => {
        ok = await result.current.setFavorite("conv-1", false);
      });

      expect(ok).toBe(true);
      expect(setConversationFavorite).toHaveBeenCalledWith("pref-tok", "conv-1", false);
    });

    it("handles favorite failure", async () => {
      vi.mocked(setConversationFavorite).mockRejectedValueOnce(new Error("Fallo de red"));

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = true;
      await act(async () => {
        ok = await result.current.setFavorite("conv-1", true);
      });

      expect(ok).toBe(false);
      expect(result.current.error).toBe("Fallo de red");
    });

    it("returns false if no session is active", async () => {
      vi.mocked(useAuth).mockReturnValue({
        session: null,
        status: "unauthenticated",
        login: vi.fn(),
        logout: vi.fn(),
        updateSessionUser: vi.fn(),
        expireSession: vi.fn(),
        completePasswordChange: vi.fn(),
      });

      const { result } = renderHook(() => useSetConversationPreference());

      let ok = true;
      await act(async () => {
        ok = await result.current.setFavorite("conv-1", true);
      });

      expect(ok).toBe(false);
      expect(setConversationFavorite).not.toHaveBeenCalled();
    });
  });
});
