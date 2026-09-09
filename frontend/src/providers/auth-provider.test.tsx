import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth-provider";
import { login as loginRequest } from "@/features/auth/api/auth.api";
import { disconnectSocket } from "@/lib/socket-client";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/features/auth/api/auth.api", () => ({
  login: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  disconnectSocket: vi.fn(),
}));

function AuthConsumer() {
  const { session, status, login, logout, updateSessionUser } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="username">{session?.user.username ?? "none"}</span>
      <span data-testid="fullname">{session?.user.fullName ?? "none"}</span>
      <button onClick={() => void login({ user: "alice", password: "secret-password" })}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
      <button onClick={() => updateSessionUser({ fullName: "Alice Updated" })}>
        Update User
      </button>
    </div>
  );
}

describe("AuthProvider and useAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("initializes with unauthenticated status when localStorage is empty", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    });
    expect(screen.getByTestId("username").textContent).toBe("none");
  });

  it("restores session from localStorage on mount", async () => {
    const mockSession = createMockSession();
    window.localStorage.setItem("chat-interno:session", JSON.stringify(mockSession));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });
    expect(screen.getByTestId("username").textContent).toBe("testuser");
    expect(screen.getByTestId("fullname").textContent).toBe("Test User");
  });

  it("handles corrupted JSON in localStorage gracefully", async () => {
    window.localStorage.setItem("chat-interno:session", "{invalid json");

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    });
    expect(screen.getByTestId("username").textContent).toBe("none");
  });

  it("login updates session and status, and saves to localStorage", async () => {
    const mockSession = createMockSession({
      token: "new-token-123",
      user: {
        ...createMockSession().user,
        username: "alice",
        fullName: "Alice Smith",
      },
    });

    vi.mocked(loginRequest).mockResolvedValueOnce({
      token: mockSession.token,
      user: mockSession.user,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });
    expect(screen.getByTestId("username").textContent).toBe("alice");
    expect(screen.getByTestId("fullname").textContent).toBe("Alice Smith");

    const saved = JSON.parse(window.localStorage.getItem("chat-interno:session") || "{}");
    expect(saved.token).toBe("new-token-123");
    expect(saved.user.username).toBe("alice");
  });

  it("logout clears session, disconnects socket, and removes from localStorage", async () => {
    const mockSession = createMockSession();
    window.localStorage.setItem("chat-interno:session", JSON.stringify(mockSession));

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated");
    });

    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(disconnectSocket).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("chat-interno:session")).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(screen.getByTestId("username").textContent).toBe("none");
  });

  it("updateSessionUser updates user fields in memory and in localStorage", async () => {
    const mockSession = createMockSession();
    window.localStorage.setItem("chat-interno:session", JSON.stringify(mockSession));

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fullname").textContent).toBe("Test User");
    });

    await user.click(screen.getByRole("button", { name: "Update User" }));

    expect(screen.getByTestId("fullname").textContent).toBe("Alice Updated");

    const saved = JSON.parse(window.localStorage.getItem("chat-interno:session") || "{}");
    expect(saved.user.fullName).toBe("Alice Updated");
  });

  it("throws error when useAuth is called outside AuthProvider", () => {
    expect(() => render(<AuthConsumer />)).toThrow(
      "useAuth debe usarse dentro de un AuthProvider",
    );
  });
});
