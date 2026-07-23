import { AppServer, AppSocket } from "../../socket/types";

// Nombres de los eventos propios de este módulo viven aquí, no en socket/events.ts.
// Ejemplo a futuro: export const CONVERSATION_EVENTS = { JOIN: "conversation:join", ... } as const;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerConversationSocket(_socket: AppSocket, _io: AppServer): void {
  // Los listeners de este módulo (unirse/salir de una conversación, etc.) se
  // agregan aquí en un paso posterior, usando joinConversation/leaveConversation
  // de socket/rooms.ts. Todavía no hay eventos reales.
}
