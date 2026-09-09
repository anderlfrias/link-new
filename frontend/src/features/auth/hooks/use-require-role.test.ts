import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRequireRole } from "./use-require-role";
import { useAuth } from "@/providers/auth-provider";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

describe("useRequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns checking when auth status is idle", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "idle",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useRequireRole("ADMIN"));
    expect(result.current).toEqual({ status: "checking", session: null });
  });

  it("returns unauthenticated when auth status is unauthenticated or session is null", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useRequireRole("ADMIN"));
    expect(result.current).toEqual({ status: "unauthenticated", session: null });
  });

  it("returns forbidden when user does not have the required role", () => {
    const mockSession = createMockSession({
      user: {
        ...createMockSession().user,
        roles: ["USER"],
      },
    });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useRequireRole("ADMIN"));
    expect(result.current).toEqual({ status: "forbidden", session: mockSession });
  });

  it("returns authorized when user possesses the required role", () => {
    const mockSession = createMockSession({
      user: {
        ...createMockSession().user,
        roles: ["ADMIN", "USER"],
      },
    });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });

    const { result } = renderHook(() => useRequireRole("ADMIN"));
    expect(result.current).toEqual({ status: "authorized", session: mockSession });
  });
});
