import { joinUser } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";

// Nombres de los eventos propios de este módulo viven aquí, no en socket/events.ts.
// Ejemplo a futuro: export const PRESENCE_EVENTS = { ONLINE: "presence:online", ... } as const;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerPresenceSocket(socket: AppSocket, _io: AppServer): void {
  // Unir cada socket a su room personal (user:<id>) apenas conecta era el
  // paso que faltaba: `conversation:created` (conversation.service.ts) y
  // `conversation:updated` al cambiar el último mensaje (message.service.ts)
  // ya emiten a esa room desde hace rato, pero sin este join nunca había
  // ningún socket adentro — esos emits se perdían en silencio. Por eso la
  // lista de conversaciones solo parecía "vivir" si la conversación afectada
  // ya estaba abierta (su room propia sí funciona), o al recuperar el foco de
  // la ventana (fallback HTTP en use-conversations.ts/use-messages.ts). El
  // socket.io ya limpia la membresía de rooms solo al desconectar, así que no
  // hace falta un leaveUser explícito acá.
  //
  // Los listeners de "usuario en línea/desconectado" (presencia real) se
  // agregan en un paso posterior — esto solo resuelve el join a la room.
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) return;

  joinUser(socket, user.internalUserId);
}
