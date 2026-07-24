import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";

let socket: Socket | null = null;

/** Crea (o reutiliza) la conexión de socket autenticada. Ver backend/API.md sección 3. */
export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(env.socketUrl, { auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
