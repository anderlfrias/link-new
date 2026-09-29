import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateLanguage } from "./use-update-language";
import { updateUserPreferences } from "@/features/auth/api/auth.api";

const mockUpdateSessionUser = vi.fn();
const mockUseAuth = vi.fn();
const mockSetLocale = vi.fn();

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    locale: "es",
    setLocale: mockSetLocale,
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  updateUserPreferences: vi.fn(),
}));

describe("useUpdateLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { token: "token-123", user: { language: "es" } },
      updateSessionUser: mockUpdateSessionUser,
    });
  });

  it("cambia el idioma en la UI y sincroniza con el backend cuando hay sesión", async () => {
    vi.mocked(updateUserPreferences).mockResolvedValueOnce({
      notificationSoundEnabled: true,
      language: "en",
    });

    const { result } = renderHook(() => useUpdateLanguage());

    let ok = false;
    await act(async () => {
      ok = await result.current.changeLanguage("en");
    });

    expect(ok).toBe(true);
    expect(mockSetLocale).toHaveBeenCalledWith("en");
    expect(updateUserPreferences).toHaveBeenCalledWith("token-123", { language: "en" });
    expect(mockUpdateSessionUser).toHaveBeenCalledWith({ language: "en" });
    expect(result.current.error).toBeNull();
  });

  it("cambia el idioma en la UI sin error si no hay sesión activa", async () => {
    mockUseAuth.mockReturnValue({
      session: null,
      updateSessionUser: mockUpdateSessionUser,
    });

    const { result } = renderHook(() => useUpdateLanguage());

    let ok = false;
    await act(async () => {
      ok = await result.current.changeLanguage("en");
    });

    expect(ok).toBe(true);
    expect(mockSetLocale).toHaveBeenCalledWith("en");
    expect(updateUserPreferences).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("captura errores si el backend falla", async () => {
    vi.mocked(updateUserPreferences).mockRejectedValueOnce(new Error("Error de conexión"));

    const { result } = renderHook(() => useUpdateLanguage());

    let ok = true;
    await act(async () => {
      ok = await result.current.changeLanguage("en");
    });

    expect(ok).toBe(false);
    expect(mockSetLocale).toHaveBeenCalledWith("en");
    expect(result.current.error).toBe("Error de conexión");
  });
});
