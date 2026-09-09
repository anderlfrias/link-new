import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUsers } from "./use-users";
import { listUsers } from "@/features/users/api/users.api";
import type { DirectoryUser } from "@/features/users/types/user.types";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/features/users/api/users.api", () => ({
  listUsers: vi.fn(),
}));

describe("useUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permanece en idle si enabled es false", () => {
    mockUseAuth.mockReturnValue({ session: { token: "tok" } });
    const { result } = renderHook(() => useUsers(false));

    expect(result.current.status).toBe("idle");
    expect(result.current.users).toEqual([]);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("permanece en idle si no hay session", () => {
    mockUseAuth.mockReturnValue({ session: null });
    const { result } = renderHook(() => useUsers(true));

    expect(result.current.status).toBe("idle");
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("carga usuarios con éxito y pasa a status ready", async () => {
    const mockData: DirectoryUser[] = [
      { id: "u-1", name: "User Uno", email: "u1@test.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
      { id: "u-2", name: "User Dos", email: "u2@test.com", avatarFileId: null, avatarFile: null, status: "INACTIVE" },
    ];
    mockUseAuth.mockReturnValue({ session: { token: "tok-123" } });
    vi.mocked(listUsers).mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useUsers(true));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.users).toEqual(mockData);
    expect(listUsers).toHaveBeenCalledWith("tok-123");
  });

  it("maneja error en listUsers pasando a status error", async () => {
    mockUseAuth.mockReturnValue({ session: { token: "tok-123" } });
    vi.mocked(listUsers).mockRejectedValueOnce(new Error("Network failed"));

    const { result } = renderHook(() => useUsers(true));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.users).toEqual([]);
  });
});
