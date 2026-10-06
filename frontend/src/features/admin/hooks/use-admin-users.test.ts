import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminUsers } from "./use-admin-users";
import { useAuth } from "@/providers/auth-provider";
import { listAdminUsers } from "@/features/admin/api/admin-users.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-users.api", () => ({
  listAdminUsers: vi.fn(),
}));

describe("useAdminUsers", () => {
  const mockSession = createMockSession({ token: "adm-tok" });

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

  it("fetches users on mount and populates state", async () => {
    const mockData = {
      users: [
        { id: "u-1", name: "Alice", email: "alice@test.com", createdAt: "2026-09-09T00:00:00.000Z", storage: { totalSize: 0, fileCount: 0 }, activity: { conversationCount: 0, messagesSentCount: 0, groupsAdministeredCount: 0 }, syncProfileWithIntegration: true },
      ],
      totalCount: 1,
    };
    vi.mocked(listAdminUsers).mockResolvedValueOnce(mockData as any);

    const { result } = renderHook(() => useAdminUsers({}));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.users).toEqual(mockData.users);
    expect(result.current.totalCount).toBe(1);
    expect(result.current.hasMore).toBe(false);
  });

  it("handles error during user fetch", async () => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(new Error("Error al obtener usuarios"));

    const { result } = renderHook(() => useAdminUsers({}));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("Error al obtener usuarios");
  });

  it("refetch triggers reload of users", async () => {
    vi.mocked(listAdminUsers)
      .mockResolvedValueOnce({ users: [], totalCount: 0 } as any)
      .mockResolvedValueOnce({ users: [{ id: "u-2" }], totalCount: 1 } as any);

    const { result } = renderHook(() => useAdminUsers({}));

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.totalCount).toBe(1);
    });
    expect(listAdminUsers).toHaveBeenCalledTimes(2);
  });
});
