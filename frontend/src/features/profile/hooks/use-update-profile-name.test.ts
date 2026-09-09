import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateProfileName } from "./use-update-profile-name";
import { updateProfile } from "@/features/auth/api/auth.api";

const mockUpdateSessionUser = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  updateProfile: vi.fn(),
}));

describe("useUpdateProfileName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { token: "token-123", user: { fullName: "Nombre Viejo" } },
      updateSessionUser: mockUpdateSessionUser,
    });
  });

  it("actualiza el nombre exitosamente y actualiza la sesión", async () => {
    vi.mocked(updateProfile).mockResolvedValueOnce({ id: "u-1", name: "Nombre Nuevo", email: "u@example.com", avatarFileId: null } as any);

    const { result } = renderHook(() => useUpdateProfileName());

    let success = false;
    await act(async () => {
      success = await result.current.updateName("Nombre Nuevo");
    });

    expect(success).toBe(true);
    expect(updateProfile).toHaveBeenCalledWith("token-123", "Nombre Nuevo");
    expect(mockUpdateSessionUser).toHaveBeenCalledWith({ fullName: "Nombre Nuevo" });
    expect(result.current.error).toBeNull();
  });

  it("captura errores y setea estado de error", async () => {
    vi.mocked(updateProfile).mockRejectedValueOnce(new Error("Nombre inválido"));

    const { result } = renderHook(() => useUpdateProfileName());

    let success = true;
    await act(async () => {
      success = await result.current.updateName("Nombre");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Nombre inválido");
  });
});
