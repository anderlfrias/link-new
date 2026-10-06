import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConversations } from "./use-conversations";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { listConversations } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import { createMockSession } from "@/test/test-utils";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/socket-provider", () => ({
  useSocket: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  listConversations: vi.fn(),
}));

describe("useConversations", () => {
  const mockSession = createMockSession({ token: "conv-tok" });
  let mockSocket: { on: any; off: any; emit: any };
  let eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  const mockConversations: ConversationListItem[] = [
    {
      id: "conv-1",
      name: "Chat 1",
      type: "PRIVATE",
      imageFileId: null,
      imageFile: null,
      createdById: "user-1",
      lastMessageId: "msg-1",
      lastMessageAt: "2026-09-09T10:00:00Z",
      lastMessageSenderId: "user-2",
      createdAt: "2026-09-09T09:00:00Z",
      updatedAt: "2026-09-09T10:00:00Z",
      deletedAt: null,
      members: [],
      unreadCount: 0,
      lastMessageStatus: "read",
      lastMessagePreview: "Hola",
      isPinnedByMe: false,
      isFavoritedByMe: false,
    },
  ];

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
    });

    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket as any,
      connected: true,
    });
  });

  it("fetches conversations on mount", async () => {
    vi.mocked(listConversations).mockResolvedValueOnce(mockConversations);

    const { result } = renderHook(() => useConversations());

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.conversations).toEqual(mockConversations);
    expect(listConversations).toHaveBeenCalledWith("conv-tok");
  });

  it("sets error status on fetch failure", async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });

  it("does not fetch if session is null", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const { result } = renderHook(() => useConversations());

    expect(result.current.status).toBe("idle");
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("refreshes conversations on window focus", async () => {
    vi.mocked(listConversations).mockResolvedValue(mockConversations);

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(listConversations).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(listConversations).toHaveBeenCalledTimes(2);
    });
  });

  it("subscribes to socket events and refreshes on conversation updates", async () => {
    vi.mocked(listConversations).mockResolvedValue(mockConversations);

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(mockSocket.on).toHaveBeenCalledWith(SOCKET_EVENTS.conversation.created, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(SOCKET_EVENTS.conversation.updated, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith("connect", expect.any(Function));

    // Simulate socket event
    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.updated]?.[0];
      handler?.();
    });

    await waitFor(() => {
      expect(listConversations).toHaveBeenCalledTimes(2);
    });
  });

  it("cleans up window and socket listeners on unmount", async () => {
    vi.mocked(listConversations).mockResolvedValue(mockConversations);

    const { unmount } = renderHook(() => useConversations());

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith(SOCKET_EVENTS.conversation.created, expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("connect", expect.any(Function));
  });
});
