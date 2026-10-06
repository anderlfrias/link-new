import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PublicSettingsProvider, usePublicSettings } from "./public-settings-provider";
import { useAuth } from "@/providers/auth-provider";
import { getPublicSettings } from "@/features/settings/api/public-settings.api";
import { createMockSession, createMockPublicSettings } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/settings/api/public-settings.api", () => ({
  getPublicSettings: vi.fn(),
}));

function SettingsConsumer() {
  const settings = usePublicSettings();
  return (
    <div>
      <span data-testid="settings-value">
        {settings ? JSON.stringify(settings) : "null"}
      </span>
      <span data-testid="max-upload">
        {settings ? String(settings.maxUploadSizeMb) : "none"}
      </span>
    </div>
  );
}

describe("PublicSettingsProvider and usePublicSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides null settings and does not fetch when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    expect(screen.getByTestId("settings-value").textContent).toBe("null");
    expect(getPublicSettings).not.toHaveBeenCalled();
  });

  it("fetches settings using session token when authenticated and provides them", async () => {
    const mockSession = createMockSession({ token: "auth-token-xyz" });
    const mockSettings = createMockPublicSettings({ maxUploadSizeMb: 50 });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockResolvedValueOnce(mockSettings);

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    expect(getPublicSettings).toHaveBeenCalledWith("auth-token-xyz");

    await waitFor(() => {
      expect(screen.getByTestId("max-upload").textContent).toBe("50");
    });
  });

  it("sets settings to null if getPublicSettings fails", async () => {
    const mockSession = createMockSession();

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockRejectedValueOnce(new Error("Network failure"));

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("settings-value").textContent).toBe("null");
    });
  });

  it("cancels in-flight request on unmount", async () => {
    const mockSession = createMockSession();

    let resolvePromise: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockReturnValueOnce(slowPromise as any);

    const { unmount } = render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    unmount();
    // Resolve after unmount
    resolvePromise!(createMockPublicSettings());
    // No error thrown and clean unmount
  });
});
