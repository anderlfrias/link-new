import { isConversationMember } from "../conversations/conversation.repository";
import { conversationRoomName } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";

/// `CREATED`/`UPDATED`/`DELETED` los emite el servidor (ver
/// message.service.ts) hacia la room de la conversación. `TYPING_START`/`STOP`
/// son los únicos eventos que dispara el cliente: estado efímero, nunca se
/// persiste (ver backend/README.md, "Por qué 'typing' no se guarda en la BD").
export const MESSAGE_EVENTS = {
  CREATED: "message:created",
  UPDATED: "message:updated",
  DELETED: "message:deleted",
  TYPING_START: "message:typing_start",
  TYPING_STOP: "message:typing_stop",
} as const;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerMessageSocket(socket: AppSocket, _io: AppServer): void {
  socket.on(MESSAGE_EVENTS.TYPING_START, (conversationId: string) => {
    void relayTyping(socket, conversationId, MESSAGE_EVENTS.TYPING_START);
  });

  socket.on(MESSAGE_EVENTS.TYPING_STOP, (conversationId: string) => {
    void relayTyping(socket, conversationId, MESSAGE_EVENTS.TYPING_STOP);
  });
}

async function relayTyping(socket: AppSocket, conversationId: string, event: string): Promise<void> {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) return;

  const isMember = await isConversationMember(conversationId, user.internalUserId);
  if (!isMember) return;

  // socket.to() (a diferencia de io.to()) excluye al propio emisor: nadie
  // necesita que le reboten su propio "estoy escribiendo".
  socket.to(conversationRoomName(conversationId)).emit(event, { conversationId, userId: user.internalUserId });
}
