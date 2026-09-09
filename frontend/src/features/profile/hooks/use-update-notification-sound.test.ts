import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateNotificationSound } from "./use-update-notification-sound";
import { updateNotificationSoundPreference } from "@/features/auth/api/auth.api";

const mockUpdateSessionUser = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  updateNotificationSoundPreference: vi.fn(),
}));

describe("useUpdateNotificationSound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { token: "token-123", user: { notificationSoundEnabled: true } },
      updateSessionUser: mockUpdateSessionUser,
    });
  });

  it("actualiza la preferencia de sonido y el estado de la sesión", async () => {
    vi.mocked(updateNotificationSoundPreference).mockResolvedValueOnce({
      notificationSoundEnabled: false,
    });

    const { result } = renderHook(() => useUpdateNotificationSound());

    let ok = false;
    await act(async () => {
      ok = await result.current.setEnabled(false);
    });

    expect(ok).toBe(true);
    expect(updateNotificationSoundPreference).toHaveBeenCalledWith("token-123", false);
    expect(mockUpdateSessionUser).toHaveBeenCalledWith({ notificationSoundEnabled: false });
    expect(result.current.error).toBeNull();
  });

  it("captura errores si la actualización falla", async () => {
    vi.mocked(updateNotificationSoundPreference).mockRejectedValueOnce(new Error("Fallo de red"));

    const { result } = renderHook(() => useUpdateNotificationSound());

    let ok = true;
    await act(async () => {
      ok = await result.current.setEnabled(true);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("Fallo de red");
  });
});
