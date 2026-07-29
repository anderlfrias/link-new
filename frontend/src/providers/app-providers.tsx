"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { ProfilePictureProvider } from "@/providers/profile-picture-provider";
import { SocketProvider } from "@/providers/socket-provider";
import { ThemeProvider } from "@/providers/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfilePictureProvider>
          <SocketProvider>{children}</SocketProvider>
        </ProfilePictureProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
