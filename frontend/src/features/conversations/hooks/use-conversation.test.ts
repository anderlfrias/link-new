import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConversation } from "./use-conversation";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { getConversation } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import { createMockSession } from "@/test/test-utils";
import type { Conversation } from "@/features/conversations/types/conversation.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/socket-provider", () => ({
  useSocket: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  getConversation: vi.fn(),
}));

describe("useConversation", () => {
  const mockSession = createMockSession({ token: "conv-tok" });
  let mockSocket: { on: any; off: any; emit: any };
  let eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  const mockConversation: Conversation = {
    id: "conv-1",
    name: "General",
    type: "GROUP",
    imageFileId: null,
    imageFile: null,
    createdById: "user-1",
    lastMessageId: null,
    lastMessageAt: null,
    lastMessageSenderId: null,
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T10:00:00Z",
    deletedAt: null,
    members: [
      {
        id: "mem-1",
        conversationId: "conv-1",
        userId: "user-1",
        joinedAt: "2026-09-09T09:00:00Z",
        lastReadMessageId: null,
        lastReadAt: null,
        lastDeliveredMessageId: null,
        lastDeliveredAt: null,
        isAdmin: true,
        isPinned: false,
        isFavorite: false,
        user: {
          id: "user-1",
          name: "User One",
          email: "user1@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
      {
        id: "mem-2",
        conversationId: "conv-1",
        userId: "user-2",
        joinedAt: "2026-09-09T09:00:00Z",
        lastReadMessageId: null,
        lastReadAt: null,
        lastDeliveredMessageId: null,
        lastDeliveredAt: null,
        isAdmin: false,
        isPinned: false,
        isFavorite: false,
        user: {
          id: "user-2",
          name: "User Two",
          email: "user2@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventListeners = {};
    mockSocket = {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(cb);
      }),
      off: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter((fn) => fn !== cb);
        }
      }),
      emit: vi.fn(),
    };

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket as any,
      connected: true,
    });
  });

  it("loads conversation details on mount", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation("conv-1"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.conversation).toEqual(mockConversation);
    expect(getConversation).toHaveBeenCalledWith("conv-tok", "conv-1");
  });

  it("handles conversation load error", async () => {
    vi.mocked(getConversation).mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(() => useConversation("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.conversation).toBeNull();
  });

  it("updates conversation on conversation:updated event for same id", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const updatedConv = { ...mockConversation, name: "New Name" };

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.updated]?.[0];
      handler?.(updatedConv);
    });

    expect(result.current.conversation?.name).toBe("New Name");
  });

  it("ignores conversation:updated event for different conversation id", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.updated]?.[0];
      handler?.({ ...mockConversation, id: "conv-other", name: "Other Name" });
    });

    expect(result.current.conversation?.name).toBe("General");
  });

  it("patches member admin state on conversation:member_admin_changed", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.memberAdminChanged]?.[0];
      handler?.({ conversationId: "conv-1", userId: "user-2", isAdmin: true });
    });

    const user2Member = result.current.conversation?.members.find((m) => m.userId === "user-2");
    expect(user2Member?.isAdmin).toBe(true);
  });

  it("refetches conversation on conversation:member_added", async () => {
    vi.mocked(getConversation).mockResolvedValueOnce(mockConversation);

    const { result } = renderHook(() => useConversation("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const refetchedConv = {
      ...mockConversation,
      members: [
        ...mockConversation.members,
        {
          id: "mem-3",
          conversationId: "conv-1",
          userId: "user-3",
          joinedAt: "2026-09-09T11:00:00Z",
          lastReadMessageId: null,
          lastReadAt: null,
          lastDeliveredMessageId: null,
          lastDeliveredAt: null,
          isAdmin: false,
          isPinned: false,
          isFavorite: false,
          user: {
            id: "user-3",
            name: "User Three",
            email: "user3@example.com",
            avatarFileId: null,
            avatarFile: null,
            status: "ACTIVE" as const,
          },
        },
      ],
    };

    vi.mocked(getConversation).mockResolvedValueOnce(refetchedConv);

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.memberAdded]?.[0];
      handler?.({ conversationId: "conv-1" });
    });

    await waitFor(() => {
      expect(result.current.conversation?.members).toHaveLength(3);
    });

    expect(getConversation).toHaveBeenCalledTimes(2);
  });
});
