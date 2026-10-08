import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { AppProviders } from "@/providers/app-providers";
import type { AuthConfig, AuthUser, Session } from "@/features/auth/types/auth.types";
import type { PublicAppSettings } from "@/features/settings/types/public-settings.types";
import { THEME_STORAGE_KEY } from "@/constants/theme";
import { LOCALE_STORAGE_KEY, type Locale } from "@/i18n/types";

export function createMockAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-uuid-1",
    internalUserId: "user-uuid-1",
    email: "test@example.com",
    username: "testuser",
    fullName: "Test User",
    roles: ["USER"],
    exp: Math.floor(Date.now() / 1000) + 3600,
    notificationSoundEnabled: true,
    ...overrides,
  };
}

export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    token: "mock-jwt-token",
    user: createMockAuthUser(overrides.user),
    ...overrides,
  };
}

export function createMockPublicSettings(
  overrides: Partial<PublicAppSettings> = {},
): PublicAppSettings {
  return {
    maxUploadSizeMb: 25,
    chunkedUploads: false,
    maxVoiceNoteDurationSeconds: 120,
    maxGroupMembers: 100,
    maxFilesPerMessage: 10,
    allowMessageEdit: true,
    messageEditTimeLimitMinutes: 15,
    allowMessageDeleteForEveryone: true,
    messageDeleteForEveryoneTimeLimitMinutes: 60,
    allowConversationDelete: true,
    allowGroupDelete: true,
    allowStickersAndGifs: true,
    ...overrides,
  };
}

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  initialTheme?: "light" | "dark";
  initialLocale?: Locale;
  initialSession?: Session | null;
}

export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  const { initialTheme, initialLocale, initialSession, ...renderOptions } = options;

  if (initialTheme) {
    window.localStorage.setItem(THEME_STORAGE_KEY, initialTheme);
  }

  if (initialLocale) {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, initialLocale);
  }

  if (initialSession !== undefined) {
    if (initialSession) {
      window.localStorage.setItem(
        "link:session",
        JSON.stringify(initialSession),
      );
    } else {
      window.localStorage.removeItem("link:session");
    }
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <AppProviders>{children}</AppProviders>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from "@testing-library/react";

/** `GET /auth/config` de una instalación con cuentas locales o con un proveedor externo. */
export function createMockAuthConfig(kind: "local" | "external", overrides: Partial<AuthConfig> = {}): AuthConfig {
  if (kind === "local") {
    return {
      provider: { id: "local", displayName: "LINK", external: false },
      capabilities: { passwordChange: true, accountManagement: "full" },
      passwordPolicy: {
        minLength: 12,
        maxLength: 128,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: false,
        requireSymbol: false,
        historyCount: 0,
      },
      ...overrides,
    };
  }
  return {
    provider: { id: "test-provider", displayName: "Test Provider", external: true },
    capabilities: { passwordChange: false, accountManagement: "status-only" },
    ...overrides,
  };
}
