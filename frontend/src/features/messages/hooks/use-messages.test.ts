import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMessages } from "./use-messages";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import {
  listMessages,
  sendMessage as sendMessageApi,
  editMessage as editMessageApi,
  deleteMessage as deleteMessageApi,
  toggleReaction as toggleReactionApi,
} from "@/features/messages/api/messages.api";
import { markConversationRead } from "@/features/conversations/api/conversations.api";
import { SOCKET_EVENTS } from "@/constants/socket-events";
import { createMockSession } from "@/test/test-utils";
import type { Message } from "@/features/messages/types/message.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/socket-provider", () => ({
  useSocket: vi.fn(),
}));

vi.mock("@/features/messages/api/messages.api", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  toggleReaction: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  markConversationRead: vi.fn(),
}));

describe("useMessages", () => {
  const mockSession = createMockSession({ token: "msg-token" });
  let mockSocket: { on: any; off: any; emit: any };
  let eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  const baseMessage: Message = {
    id: "m-1",
    conversationId: "conv-1",
    senderId: "user-other",
    type: "TEXT",
    content: "Hola mundo",
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: "2026-09-09T10:00:00Z",
    sender: {
      id: "user-other",
      name: "Dr. Otro",
      email: "otro@example.com",
      avatarFileId: null,
    },
    files: [],
    replyToId: null,
    replyTo: null,
    forwardedFromId: null,
    forwardedFrom: null,
    receipts: [],
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

    vi.mocked(listMessages).mockResolvedValue([baseMessage]);
    vi.mocked(markConversationRead).mockResolvedValue({} as any);

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

  it("loads messages on mount, joins socket room, and marks conversation as read", async () => {
    const { result } = renderHook(() => useMessages("conv-1"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.messages).toEqual([baseMessage]);
    expect(listMessages).toHaveBeenCalledWith("msg-token", "conv-1", { limit: 50 });
    expect(mockSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.conversation.join, "conv-1");
    expect(markConversationRead).toHaveBeenCalledWith("msg-token", "conv-1");
  });

  it("handles fetch failure", async () => {
    vi.mocked(listMessages).mockRejectedValueOnce(new Error("Network failed"));

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.messages).toEqual([]);
  });

  it("leaves room and unsubscribes on unmount", async () => {

    const { unmount } = renderHook(() => useMessages("conv-1"));

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.conversation.leave, "conv-1");
    expect(mockSocket.off).toHaveBeenCalledWith(SOCKET_EVENTS.message.created, expect.any(Function));
  });

  it("appends new incoming message from socket and marks read", async () => {

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const newMsg: Message = { ...baseMessage, id: "m-2", content: "Nuevo mensaje" };

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.created]?.[0];
      handler?.(newMsg);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].id).toBe("m-2");
    expect(markConversationRead).toHaveBeenCalledWith("msg-token", "conv-1");
  });

  it("updates message on socket message:updated event", async () => {

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const updatedMsg: Message = { ...baseMessage, content: "Mensaje editado" };

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.updated]?.[0];
      handler?.(updatedMsg);
    });

    expect(result.current.messages[0].content).toBe("Mensaje editado");
  });

  it("clears content on socket message:deleted event", async () => {

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.deleted]?.[0];
      handler?.({ conversationId: "conv-1", messageId: "m-1", deletedAt: "2026-09-09T10:05:00Z" });
    });

    expect(result.current.messages[0].deletedAt).toBe("2026-09-09T10:05:00Z");
    expect(result.current.messages[0].content).toBe("");
    expect(result.current.messages[0].files).toEqual([]);
  });

  it("advances receipts when socket receiptUpdated event arrives", async () => {

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.conversation.receiptUpdated]?.[0];
      handler?.({
        conversationId: "conv-1",
        userId: "user-reader",
        kind: "read",
        messageId: "m-1",
        at: "2026-09-09T11:00:00Z",
      });
    });

    expect(result.current.messages[0].receipts).toEqual([
      { userId: "user-reader", status: "read" },
    ]);
  });

  it("sends message and appends to state", async () => {
    const createdMsg = { ...baseMessage, id: "m-send", content: "Mensaje enviado" };
    vi.mocked(sendMessageApi).mockResolvedValueOnce(createdMsg);

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.send("Mensaje enviado");
    });

    expect(sendMessageApi).toHaveBeenCalledWith("msg-token", "conv-1", {
      content: "Mensaje enviado",
      fileIds: undefined,
      replyToId: undefined,
      type: undefined,
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].id).toBe("m-send");
  });

  it("edits message and updates state", async () => {
    const editedMsg = { ...baseMessage, content: "Editado via API" };
    vi.mocked(editMessageApi).mockResolvedValueOnce(editedMsg);

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.edit("m-1", "Editado via API");
    });

    expect(editMessageApi).toHaveBeenCalledWith("msg-token", "conv-1", "m-1", {
      content: "Editado via API",
    });
    expect(result.current.messages[0].content).toBe("Editado via API");
  });

  it("deletes message and clears content in state", async () => {
    vi.mocked(deleteMessageApi).mockResolvedValueOnce({
      conversationId: "conv-1",
      messageId: "m-1",
      deletedAt: "2026-09-09T12:00:00Z",
    });

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.remove("m-1");
    });

    expect(deleteMessageApi).toHaveBeenCalledWith("msg-token", "conv-1", "m-1");
    expect(result.current.messages[0].deletedAt).toBe("2026-09-09T12:00:00Z");
    expect(result.current.messages[0].content).toBe("");
  });

  it("actualiza reacciones al recibir evento socket message:reaction_updated", async () => {
    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const updatedReactions = [
      { id: "r-1", messageId: "m-1", userId: "u-1", userName: "Dr. Otro", emoji: "❤️", createdAt: "2026-09-18" },
    ];

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.reactionUpdated]?.[0];
      handler?.({
        conversationId: "conv-1",
        messageId: "m-1",
        reactions: updatedReactions,
        userId: "u-1",
        emoji: "❤️",
        action: "added",
      });
    });

    expect(result.current.messages[0].reactions).toEqual(updatedReactions);
  });

  it("alterna reacción llamando a API y actualiza el estado optimista", async () => {
    const apiResult = {
      conversationId: "conv-1",
      messageId: "m-1",
      reactions: [
        { id: "r-server", messageId: "m-1", userId: "u-me", userName: "Mi Nombre", emoji: "👍", createdAt: "2026-09-18" },
      ],
      userId: "u-me",
      emoji: "👍",
      action: "added" as const,
    };
    vi.mocked(toggleReactionApi).mockResolvedValueOnce(apiResult);

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.toggleReaction("m-1", "👍");
    });

    expect(toggleReactionApi).toHaveBeenCalledWith("msg-token", "conv-1", "m-1", "👍");
    expect(result.current.messages[0].reactions).toEqual(apiResult.reactions);
  });

  it("reemplaza la reacción previa del usuario cuando reacciona con un emoji distinto (solo 1 reacción por usuario)", async () => {
    const initialMessageWithReaction: Message = {
      ...baseMessage,
      reactions: [
        {
          id: "r-prev",
          messageId: "m-1",
          userId: mockSession.user.internalUserId,
          userName: mockSession.user.fullName,
          emoji: "👍",
          createdAt: "2026-09-18",
        },
      ],
    };
    vi.mocked(listMessages).mockResolvedValueOnce([initialMessageWithReaction]);

    const apiResult = {
      conversationId: "conv-1",
      messageId: "m-1",
      reactions: [
        {
          id: "r-new",
          messageId: "m-1",
          userId: mockSession.user.internalUserId,
          userName: mockSession.user.fullName,
          emoji: "❤️",
          createdAt: "2026-09-18",
        },
      ],
      userId: mockSession.user.internalUserId,
      emoji: "❤️",
      action: "updated" as const,
    };
    vi.mocked(toggleReactionApi).mockResolvedValueOnce(apiResult);

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      await result.current.toggleReaction("m-1", "❤️");
    });

    expect(toggleReactionApi).toHaveBeenCalledWith("msg-token", "conv-1", "m-1", "❤️");
    expect(result.current.messages[0].reactions).toHaveLength(1);
    expect(result.current.messages[0].reactions![0].emoji).toBe("❤️");
  });
});
