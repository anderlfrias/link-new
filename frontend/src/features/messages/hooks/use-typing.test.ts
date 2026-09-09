import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTyping } from "./use-typing";
import { useSocket } from "@/providers/socket-provider";
import { SOCKET_EVENTS } from "@/constants/socket-events";

vi.mock("@/providers/socket-provider", () => ({
  useSocket: vi.fn(),
}));

describe("useTyping", () => {
  let mockSocket: { on: any; off: any; emit: any };
  let eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  beforeEach(() => {
    vi.useFakeTimers();
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

    vi.mocked(useSocket).mockReturnValue({
      socket: mockSocket as any,
      connected: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds and removes typing user based on socket events", () => {
    const { result } = renderHook(() => useTyping("conv-1"));

    expect(result.current.typingUserIds).toEqual([]);

    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.typingStart]?.[0];
      handler?.({ conversationId: "conv-1", userId: "user-2" });
    });

    expect(result.current.typingUserIds).toEqual(["user-2"]);

    // Event for different conversation is ignored
    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.typingStart]?.[0];
      handler?.({ conversationId: "conv-other", userId: "user-3" });
    });
    expect(result.current.typingUserIds).toEqual(["user-2"]);

    // Stop event
    act(() => {
      const handler = eventListeners[SOCKET_EVENTS.message.typingStop]?.[0];
      handler?.({ conversationId: "conv-1", userId: "user-2" });
    });
    expect(result.current.typingUserIds).toEqual([]);
  });

  it("notifyTyping emits typingStart and schedules typingStop after 4 seconds", () => {
    const { result } = renderHook(() => useTyping("conv-1"));

    act(() => {
      result.current.notifyTyping();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.message.typingStart, "conv-1");

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.message.typingStop, "conv-1");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.message.typingStop, "conv-1");
  });

  it("notifyStopped emits typingStop immediately", () => {
    const { result } = renderHook(() => useTyping("conv-1"));

    act(() => {
      result.current.notifyStopped();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.message.typingStop, "conv-1");
  });
});
