import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateAdminSettings } from "./use-update-admin-settings";
import { useAuth } from "@/providers/auth-provider";
import { updateAdminSettings } from "@/features/admin/api/admin-settings.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-settings.api", () => ({
  updateAdminSettings: vi.fn(),
}));

describe("useUpdateAdminSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without calling API if session is null", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const { result } = renderHook(() => useUpdateAdminSettings());

    let res: any;
    await act(async () => {
      res = await result.current.save({ maxUploadSizeMb: 100 });
    });

    expect(res).toBeNull();
    expect(updateAdminSettings).not.toHaveBeenCalled();
  });

  it("updates settings and returns result when authenticated", async () => {
    const mockSession = createMockSession({ token: "adm-tok" });
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const updated = { maxUploadSizeMb: 100 } as any;
    vi.mocked(updateAdminSettings).mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useUpdateAdminSettings());

    let res: any;
    await act(async () => {
      res = await result.current.save({ maxUploadSizeMb: 100 });
    });

    expect(updateAdminSettings).toHaveBeenCalledWith("adm-tok", { maxUploadSizeMb: 100 });
    expect(res).toBe(updated);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("catches error, updates error state, and returns null", async () => {
    const mockSession = createMockSession({ token: "adm-tok" });
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    vi.mocked(updateAdminSettings).mockRejectedValueOnce(new Error("Error al guardar"));

    const { result } = renderHook(() => useUpdateAdminSettings());

    let res: any;
    await act(async () => {
      res = await result.current.save({ maxUploadSizeMb: 100 });
    });

    expect(res).toBeNull();
    expect(result.current.error).toBe("Error al guardar");
    expect(result.current.pending).toBe(false);
  });
});
