import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAdminSettings } from "./use-admin-settings";
import { useAuth } from "@/providers/auth-provider";
import { getAdminSettings } from "@/features/admin/api/admin-settings.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-settings.api", () => ({
  getAdminSettings: vi.fn(),
}));

describe("useAdminSettings", () => {
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

  it("fetches settings on mount", async () => {
    const mockSettings = { maxUploadSizeMb: 50 };
    vi.mocked(getAdminSettings).mockResolvedValueOnce(mockSettings as any);

    const { result } = renderHook(() => useAdminSettings());

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.settings).toEqual(mockSettings);
  });

  it("handles fetch failure", async () => {
    vi.mocked(getAdminSettings).mockRejectedValueOnce(new Error("Fallo de red"));

    const { result } = renderHook(() => useAdminSettings());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("Fallo de red");
  });

  it("refetch triggers reload of settings", async () => {
    vi.mocked(getAdminSettings)
      .mockResolvedValueOnce({ maxUploadSizeMb: 50 } as any)
      .mockResolvedValueOnce({ maxUploadSizeMb: 100 } as any);

    const { result } = renderHook(() => useAdminSettings());

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(result.current.settings?.maxUploadSizeMb).toBe(50);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.settings?.maxUploadSizeMb).toBe(100);
    });
    expect(getAdminSettings).toHaveBeenCalledTimes(2);
  });
});
