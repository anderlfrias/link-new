import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConversationSettings } from "./use-conversation-settings";
import { useAuth } from "@/providers/auth-provider";
import { getConversationSettings } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";
import type { ConversationEffectiveSettings } from "@/features/conversations/types/group-settings.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  getConversationSettings: vi.fn(),
}));

describe("useConversationSettings", () => {
  const mockSession = createMockSession({ token: "settings-tok" });

  const mockSettings: ConversationEffectiveSettings = {
    conversationId: "conv-1",
    effective: {
      whoCanAddMembers: "ALL_MEMBERS",
      whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
      maxGroupMembers: 100,
      whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
      whoCanDeleteGroup: "CREATOR_ONLY",
    },
    overrideAllowed: {
      whoCanAddMembers: true,
      whoCanRemoveMembers: true,
      maxGroupMembers: true,
      whoCanChangeGroupInfo: true,
      whoCanDeleteGroup: true,
    },
  };

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

  it("does not fetch when enabled is false (e.g. for PRIVATE conversation)", () => {
    const { result } = renderHook(() => useConversationSettings("conv-1", false));

    expect(result.current.status).toBe("idle");
    expect(getConversationSettings).not.toHaveBeenCalled();
  });

  it("fetches settings when enabled is true", async () => {
    vi.mocked(getConversationSettings).mockResolvedValueOnce(mockSettings);

    const { result } = renderHook(() => useConversationSettings("conv-1", true));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.settings).toEqual(mockSettings);
    expect(getConversationSettings).toHaveBeenCalledWith("settings-tok", "conv-1");
  });

  it("handles settings fetch failure", async () => {
    vi.mocked(getConversationSettings).mockRejectedValueOnce(new Error("No autorizado"));

    const { result } = renderHook(() => useConversationSettings("conv-1", true));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("No autorizado");
  });

  it("refetch triggers reload of settings", async () => {
    vi.mocked(getConversationSettings)
      .mockResolvedValueOnce(mockSettings)
      .mockResolvedValueOnce({
        ...mockSettings,
        effective: { ...mockSettings.effective, maxGroupMembers: 200 },
      });

    const { result } = renderHook(() => useConversationSettings("conv-1", true));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.settings?.effective.maxGroupMembers).toBe(200);
    });

    expect(getConversationSettings).toHaveBeenCalledTimes(2);
  });
});
