import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateProfilePicture } from "./use-update-profile-picture";
import { updateProfilePicture, deleteProfilePicture } from "@/features/auth/api/auth.api";
import { compressImage } from "@/utils/compress-image";

const mockRefresh = vi.fn();
vi.mock("@/features/auth/hooks/use-profile-picture", () => ({
  useProfilePicture: () => ({ refresh: mockRefresh }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  updateProfilePicture: vi.fn(),
  deleteProfilePicture: vi.fn(),
}));

vi.mock("@/utils/compress-image", () => ({
  compressImage: vi.fn(),
  IMAGE_COMPRESSION_PRESETS: { avatar: {} },
}));

describe("useUpdateProfilePicture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { token: "token-123" },
    });
  });

  it("upload comprime imagen, actualiza foto y refresca", async () => {
    const fakeBlob = new Blob(["test"], { type: "image/png" });
    const compressedFile = new File(["comp"], "avatar.png", { type: "image/png" });
    vi.mocked(compressImage).mockResolvedValueOnce(compressedFile);
    vi.mocked(updateProfilePicture).mockResolvedValueOnce(undefined as any);

    const { result } = renderHook(() => useUpdateProfilePicture());

    await act(async () => {
      await result.current.upload(fakeBlob, "foto.png");
    });

    expect(compressImage).toHaveBeenCalledWith(fakeBlob, "foto.png", expect.any(Object));
    expect(updateProfilePicture).toHaveBeenCalledWith("token-123", compressedFile, "avatar.png");
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("remove elimina la foto de perfil y refresca", async () => {
    vi.mocked(deleteProfilePicture).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useUpdateProfilePicture());

    await act(async () => {
      await result.current.remove();
    });

    expect(deleteProfilePicture).toHaveBeenCalledWith("token-123");
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("captura errores durante la subida", async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error("Error de compresión"));

    const { result } = renderHook(() => useUpdateProfilePicture());

    await act(async () => {
      await result.current.upload(new Blob());
    });

    expect(result.current.error).toBe("Error de compresión");
  });
});
