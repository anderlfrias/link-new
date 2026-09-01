"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { ProfilePictureProvider } from "@/providers/profile-picture-provider";
import { PublicSettingsProvider } from "@/providers/public-settings-provider";
import { SocketProvider } from "@/providers/socket-provider";
import { ThemeProvider } from "@/providers/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfilePictureProvider>
          <PublicSettingsProvider>
            <SocketProvider>{children}</SocketProvider>
          </PublicSettingsProvider>
        </ProfilePictureProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
