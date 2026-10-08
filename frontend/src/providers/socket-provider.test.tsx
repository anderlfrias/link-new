import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SocketProvider, useSocket } from "./socket-provider";
import { useAuth } from "@/providers/auth-provider";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";
import { createMockSession } from "@/test/test-utils";
import { SESSION_EXPIRED_EVENT } from "@/lib/api-client";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

function SocketConsumer() {
  const { socket, connected } = useSocket();
  return (
    <div>
      <span data-testid="has-socket">{socket ? "yes" : "no"}</span>
      <span data-testid="connected">{connected ? "true" : "false"}</span>
    </div>
  );
}

describe("SocketProvider and useSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disconnects socket and provides connected: false when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    render(
      <SocketProvider>
        <SocketConsumer />
      </SocketProvider>,
    );

    expect(disconnectSocket).toHaveBeenCalled();
    expect(screen.getByTestId("has-socket").textContent).toBe("no");
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("connects socket and handles connect/disconnect events when authenticated", () => {
    const mockSession = createMockSession({ token: "socket-auth-token" });
    const handlers: Record<string, (...args: any[]) => void> = {};

    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb;
      }),
      off: vi.fn(),
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

    vi.mocked(connectSocket).mockReturnValue(mockSocket as any);

    const { unmount } = render(
      <SocketProvider>
        <SocketConsumer />
      </SocketProvider>,
    );

    expect(connectSocket).toHaveBeenCalledWith("socket-auth-token");
    expect(screen.getByTestId("has-socket").textContent).toBe("yes");
    expect(screen.getByTestId("connected").textContent).toBe("false");

    // Simulate "connect" event
    act(() => {
      handlers["connect"]?.();
    });
    expect(screen.getByTestId("connected").textContent).toBe("true");

    // Simulate "disconnect" event
    act(() => {
      handlers["disconnect"]?.();
    });
    expect(screen.getByTestId("connected").textContent).toBe("false");

    // Unmount and check cleanup
    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("disconnect", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("connect_error", expect.any(Function));
  });

  it("dispatches SESSION_EXPIRED_EVENT when socket encounters connect_error with Token expired", () => {
    const mockSession = createMockSession({ token: "expired-socket-token" });
    const handlers: Record<string, (...args: any[]) => void> = {};

    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb;
      }),
      off: vi.fn(),
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

    vi.mocked(connectSocket).mockReturnValue(mockSocket as any);

    const eventListener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventListener);

    render(
      <SocketProvider>
        <SocketConsumer />
      </SocketProvider>,
    );

    // Simulate "connect_error" with Token expired
    act(() => {
      handlers["connect_error"]?.(new Error("Token expired"));
    });

    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED_EVENT, eventListener);
  });

  describe("desconexiones", () => {
    function renderWithSocket() {
      const handlers: Record<string, (...args: any[]) => void> = {};
      const mockSocket = {
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          handlers[event] = cb;
        }),
        off: vi.fn(),
      };
      vi.mocked(useAuth).mockReturnValue({
        session: createMockSession({ token: "socket-auth-token" }),
        status: "authenticated",
        login: vi.fn(),
        logout: vi.fn(),
        updateSessionUser: vi.fn(),
        expireSession: vi.fn(),
        completePasswordChange: vi.fn(),
      });
      vi.mocked(connectSocket).mockReturnValue(mockSocket as any);

      render(
        <SocketProvider>
          <SocketConsumer />
        </SocketProvider>,
      );
      return handlers;
    }

    it("una desconexión iniciada por el servidor despacha el evento de sesión expirada", () => {
      const handlers = renderWithSocket();
      const eventListener = vi.fn();
      window.addEventListener(SESSION_EXPIRED_EVENT, eventListener);

      act(() => {
        handlers["connect"]?.();
      });
      act(() => {
        handlers["disconnect"]?.("io server disconnect");
      });

      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("connected").textContent).toBe("false");

      window.removeEventListener(SESSION_EXPIRED_EVENT, eventListener);
    });

    it.each(["io client disconnect", "transport close", "transport error", "ping timeout"])(
      "una desconexión del cliente o de red (%s) no despacha el evento",
      (reason) => {
        const handlers = renderWithSocket();
        const eventListener = vi.fn();
        window.addEventListener(SESSION_EXPIRED_EVENT, eventListener);

        act(() => {
          handlers["disconnect"]?.(reason);
        });

        expect(eventListener).not.toHaveBeenCalled();

        window.removeEventListener(SESSION_EXPIRED_EVENT, eventListener);
      },
    );
  });
});
