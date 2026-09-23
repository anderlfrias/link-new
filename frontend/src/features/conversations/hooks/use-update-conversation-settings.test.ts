import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateConversationSettings } from "./use-update-conversation-settings";
import { useAuth } from "@/providers/auth-provider";
import { updateConversationSettings } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";
import type { ConversationEffectiveSettings } from "@/features/conversations/types/group-settings.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  updateConversationSettings: vi.fn(),
}));

describe("useUpdateConversationSettings", () => {
  const mockSession = createMockSession({ token: "settings-tok" });

  const mockEffective: ConversationEffectiveSettings = {
    conversationId: "conv-1",
    effective: {
      whoCanAddMembers: "ALL_MEMBERS",
      whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
      maxGroupMembers: 50,
      whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
      whoCanDeleteGroup: "CREATOR_ONLY",
      whoCanLeaveGroup: "ALL_MEMBERS",
    },
    overrideAllowed: {
      whoCanAddMembers: true,
      whoCanRemoveMembers: true,
      maxGroupMembers: true,
      whoCanChangeGroupInfo: true,
      whoCanDeleteGroup: false,
      whoCanLeaveGroup: false,
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

  it("updates conversation settings successfully", async () => {
    vi.mocked(updateConversationSettings).mockResolvedValueOnce(mockEffective);

    const { result } = renderHook(() => useUpdateConversationSettings("conv-1"));

    let res: ConversationEffectiveSettings | null = null;
    await act(async () => {
      res = await result.current.save({ whoCanAddMembers: "GROUP_ADMINS_ONLY" });
    });

    expect(res).toEqual(mockEffective);
    expect(updateConversationSettings).toHaveBeenCalledWith("settings-tok", "conv-1", {
      whoCanAddMembers: "GROUP_ADMINS_ONLY",
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles settings update failure", async () => {
    vi.mocked(updateConversationSettings).mockRejectedValueOnce(new Error("Acción restringida"));

    const { result } = renderHook(() => useUpdateConversationSettings("conv-1"));

    let res: ConversationEffectiveSettings | null = null;
    await act(async () => {
      res = await result.current.save({ maxGroupMembers: 200 });
    });

    expect(res).toBeNull();
    expect(result.current.error).toBe("Acción restringida");
  });

  it("returns null when no session is active", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useUpdateConversationSettings("conv-1"));

    let res: ConversationEffectiveSettings | null = null;
    await act(async () => {
      res = await result.current.save({ maxGroupMembers: 50 });
    });

    expect(res).toBeNull();
    expect(updateConversationSettings).not.toHaveBeenCalled();
  });
});
