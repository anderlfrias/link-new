import { isConversationMember } from "../conversations/conversation.repository";
import { SOCKET_LIFECYCLE_EVENTS } from "../../socket/events";
import { withRequestContext } from "../../socket/request-context";
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
  // Conversaciones donde este socket mandó typing_start sin su typing_stop
  // correspondiente todavía. Solo sirve para el cleanup de abajo — no es
  // estado de negocio, por eso vive acá y no en ninguna tabla.
  const typingIn = new Set<string>();

  socket.on(
    MESSAGE_EVENTS.TYPING_START,
    withRequestContext(socket, (conversationId: string) => {
      typingIn.add(conversationId);
      void relayTyping(socket, conversationId, MESSAGE_EVENTS.TYPING_START);
    }),
  );

  socket.on(
    MESSAGE_EVENTS.TYPING_STOP,
    withRequestContext(socket, (conversationId: string) => {
      typingIn.delete(conversationId);
      void relayTyping(socket, conversationId, MESSAGE_EVENTS.TYPING_STOP);
    }),
  );

  // Si el socket se cae mientras "escribía" (crash, cerrar la pestaña, perder
  // la red) nadie manda typing_stop — sin esto, el indicador queda pegado en
  // "escribiendo..." para siempre en el resto de los clientes. `disconnecting`
  // (no `disconnect`) porque todavía hay que estar en la room para poder
  // emitirle al resto.
  socket.on(
    SOCKET_LIFECYCLE_EVENTS.DISCONNECTING,
    withRequestContext(socket, () => {
      typingIn.forEach((conversationId) => {
        void relayTyping(socket, conversationId, MESSAGE_EVENTS.TYPING_STOP);
      });
    }),
  );
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
