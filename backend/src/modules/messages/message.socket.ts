import { AppServer, AppSocket } from "../../socket/types";

// Nombres de los eventos propios de este módulo viven aquí, no en socket/events.ts.
// Ejemplo a futuro: export const MESSAGE_EVENTS = { SEND: "message:send", ... } as const;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerMessageSocket(_socket: AppSocket, _io: AppServer): void {
  // Los listeners de este módulo (message.send, message.edit, message.delete, ...)
  // se agregan aquí en un paso posterior. Todavía no hay eventos reales.
}
