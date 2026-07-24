"use client";

import { AuthProvider } from "@/providers/auth-provider";
import { SocketProvider } from "@/providers/socket-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SocketProvider>{children}</SocketProvider>
    </AuthProvider>
  );
}
