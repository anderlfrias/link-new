import { AppServer, AppSocket } from "../../socket/types";

// Nombres de los eventos propios de este módulo viven aquí, no en socket/events.ts.
// Ejemplo a futuro: export const PRESENCE_EVENTS = { ONLINE: "presence:online", ... } as const;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerPresenceSocket(_socket: AppSocket, _io: AppServer): void {
  // Los listeners de este módulo (usuario en línea, usuario desconectado, etc.)
  // se agregan aquí en un paso posterior, usando joinUser/leaveUser de
  // socket/rooms.ts. Todavía no hay eventos reales.
}
