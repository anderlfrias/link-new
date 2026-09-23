"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { ProfilePictureProvider } from "@/providers/profile-picture-provider";
import { PublicSettingsProvider } from "@/providers/public-settings-provider";
import { SocketProvider } from "@/providers/socket-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { CallProvider } from "@/features/calls/context/CallContext";
import { IncomingCallModal } from "@/features/calls/components/IncomingCallModal";
import { ActiveCallOverlay } from "@/features/calls/components/ActiveCallOverlay";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfilePictureProvider>
          <PublicSettingsProvider>
            <SocketProvider>
              <CallProvider>
                {children}
                <IncomingCallModal />
                <ActiveCallOverlay />
              </CallProvider>
            </SocketProvider>
          </PublicSettingsProvider>
        </ProfilePictureProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
