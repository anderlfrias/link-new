import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminFileStats } from "./use-admin-file-stats";
import { useAuth } from "@/providers/auth-provider";
import { getAdminFileStats } from "@/features/admin/api/admin-files.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-files.api", () => ({
  getAdminFileStats: vi.fn(),
}));

describe("useAdminFileStats", () => {
  const mockSession = createMockSession({ token: "adm-tok" });

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

  it("fetches file stats on mount", async () => {
    const mockStats = {
      localCount: 15,
      s3Count: 85,
      totalCount: 100,
      migrationEnabled: true,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    };
    vi.mocked(getAdminFileStats).mockResolvedValueOnce(mockStats);

    const { result } = renderHook(() => useAdminFileStats());

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.stats).toEqual(mockStats);
  });

  it("handles fetch failure", async () => {
    vi.mocked(getAdminFileStats).mockRejectedValueOnce(new Error("Error de conexión"));

    const { result } = renderHook(() => useAdminFileStats());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("Error de conexión");
  });

  it("refetch triggers reload of stats", async () => {
    const mockStats1 = {
      localCount: 10,
      s3Count: 0,
      totalCount: 10,
      migrationEnabled: false,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    };
    const mockStats2 = {
      localCount: 5,
      s3Count: 5,
      totalCount: 10,
      migrationEnabled: true,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    };
    vi.mocked(getAdminFileStats).mockResolvedValueOnce(mockStats1).mockResolvedValueOnce(mockStats2);

    const { result } = renderHook(() => useAdminFileStats());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.stats?.localCount).toBe(10);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.stats?.localCount).toBe(5);
    });
    expect(getAdminFileStats).toHaveBeenCalledTimes(2);
  });
});
