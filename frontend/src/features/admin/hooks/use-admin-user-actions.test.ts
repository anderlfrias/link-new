import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdminUserActions } from "./use-admin-user-actions";
import { useAuth } from "@/providers/auth-provider";
import {
  createAdminUser,
  resetAdminUserPassword,
  unlockAdminUser,
  updateAdminUser,
} from "@/features/admin/api/admin-users.api";
import type { AdminAccountView } from "@/features/admin/types/admin-users.types";
import { createMockSession } from "@/test/test-utils";
import { ApiError } from "@/types/api.types";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/admin/api/admin-users.api", () => ({
  createAdminUser: vi.fn(),
  resetAdminUserPassword: vi.fn(),
  unlockAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
}));

const account: AdminAccountView = {
  id: "u-1",
  name: "Ana",
  email: "a@example.com",
  username: null,
  status: "ACTIVE",
  localRoles: [],
  hasPassword: true,
  mustChangePassword: true,
  locked: false,
};

function mockAuth(token: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    session: token ? createMockSession({ token }) : null,
    status: token ? "authenticated" : "unauthenticated",
    login: vi.fn(),
    logout: vi.fn(),
    updateSessionUser: vi.fn(),
    expireSession: vi.fn(),
    completePasswordChange: vi.fn(),
  });
}

describe("useAdminUserActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth("adm-tok");
  });

  it("returns the result of each action and uses the session token", async () => {
    vi.mocked(createAdminUser).mockResolvedValue({ user: account, temporaryPassword: "Tmp-1" });
    vi.mocked(updateAdminUser).mockResolvedValue(account);
    vi.mocked(resetAdminUserPassword).mockResolvedValue({ temporaryPassword: "Tmp-2" });
    vi.mocked(unlockAdminUser).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAdminUserActions());

    await act(async () => {
      expect(await result.current.create({ name: "Ana", email: "a@example.com" })).toEqual({
        user: account,
        temporaryPassword: "Tmp-1",
      });
      expect(await result.current.update("u-1", { status: "INACTIVE" })).toEqual(account);
      expect(await result.current.resetPassword("u-1")).toEqual({ temporaryPassword: "Tmp-2" });
      expect(await result.current.unlock("u-1")).toBe(true);
    });

    expect(createAdminUser).toHaveBeenCalledWith("adm-tok", { name: "Ana", email: "a@example.com" });
    expect(updateAdminUser).toHaveBeenCalledWith("adm-tok", "u-1", { status: "INACTIVE" });
    expect(resetAdminUserPassword).toHaveBeenCalledWith("adm-tok", "u-1");
    expect(unlockAdminUser).toHaveBeenCalledWith("adm-tok", "u-1");
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("translates the backend codes the panel knows", async () => {
    vi.mocked(updateAdminUser).mockRejectedValue(new ApiError(409, "self", "cannot_modify_self"));
    const { result } = renderHook(() => useAdminUserActions());

    await act(async () => {
      expect(await result.current.update("u-1", { status: "INACTIVE" })).toBeNull();
    });
    expect(result.current.error).toBe("No podés desactivar tu propia cuenta ni quitarte el rol de admin.");
  });

  it("falls back to the error message for unknown failures and clears it on demand", async () => {
    vi.mocked(unlockAdminUser).mockRejectedValue(new ApiError(500, "Error del servidor", "unexpected"));
    const { result } = renderHook(() => useAdminUserActions());

    await act(async () => {
      expect(await result.current.unlock("u-1")).toBe(false);
    });
    expect(result.current.error).toBe("Error del servidor");

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("does nothing without a session", async () => {
    mockAuth(null);
    const { result } = renderHook(() => useAdminUserActions());

    await act(async () => {
      expect(await result.current.resetPassword("u-1")).toBeNull();
    });
    expect(resetAdminUserPassword).not.toHaveBeenCalled();
  });
});
