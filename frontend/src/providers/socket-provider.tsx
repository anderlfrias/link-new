"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "@/providers/auth-provider";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    const nextSocket = connectSocket(session.token);
    setSocket(nextSocket);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    nextSocket.on("connect", handleConnect);
    nextSocket.on("disconnect", handleDisconnect);

    return () => {
      nextSocket.off("connect", handleConnect);
      nextSocket.off("disconnect", handleDisconnect);
    };
  }, [session]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
