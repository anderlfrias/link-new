import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeleteAdminFile } from "./use-delete-admin-file";
import { useAuth } from "@/providers/auth-provider";
import { deleteAdminFile } from "@/features/admin/api/admin-files.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-files.api", () => ({
  deleteAdminFile: vi.fn(),
}));

describe("useDeleteAdminFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false without attempting delete if session is null", async () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });

    const { result } = renderHook(() => useDeleteAdminFile());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.remove("file-1");
    });

    expect(success).toBe(false);
    expect(deleteAdminFile).not.toHaveBeenCalled();
  });

  it("deletes file and returns true when session is present", async () => {
    const mockSession = createMockSession({ token: "adm-token" });
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });
    vi.mocked(deleteAdminFile).mockResolvedValueOnce({ id: "file-1" });

    const { result } = renderHook(() => useDeleteAdminFile());

    let success: boolean = false;
    await act(async () => {
      success = await result.current.remove("file-1");
    });

    expect(deleteAdminFile).toHaveBeenCalledWith("adm-token", "file-1");
    expect(success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("catches error, updates error state, and returns false", async () => {
    const mockSession = createMockSession({ token: "adm-token" });
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
    });
    vi.mocked(deleteAdminFile).mockRejectedValueOnce(new Error("No autorizado"));

    const { result } = renderHook(() => useDeleteAdminFile());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.remove("file-1");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("No autorizado");
    expect(result.current.pending).toBe(false);
  });
});
