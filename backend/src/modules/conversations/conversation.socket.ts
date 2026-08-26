import { isConversationMember } from "./conversation.repository";
import { joinConversation, leaveConversation } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";

/// Eventos propios de este módulo. `JOIN`/`LEAVE` los emite el cliente;
/// `CREATED`/`UPDATED`/`MEMBER_ADDED`/`MEMBER_REMOVED`/`MEMBER_ADMIN_CHANGED`/
/// `DELETED`/`RECEIPT_UPDATED` los emite el servidor (ver
/// conversation.service.ts) hacia la room de la conversación o la room
/// personal de cada usuario afectado.
export const CONVERSATION_EVENTS = {
  JOIN: "conversation:join",
  LEAVE: "conversation:leave",
  CREATED: "conversation:created",
  UPDATED: "conversation:updated",
  MEMBER_ADDED: "conversation:member_added",
  MEMBER_REMOVED: "conversation:member_removed",
  /// Un miembro fue promovido/degradado como admin de ese grupo — ver
  /// `setMemberAdminStatus` en conversation.service.ts. Cambia en vivo qué
  /// acciones puede hacer ese miembro, por eso amerita push inmediato (a
  /// diferencia de los cambios de group-settings, que no lo tienen).
  MEMBER_ADMIN_CHANGED: "conversation:member_admin_changed",
  DELETED: "conversation:deleted",
  /// Confirmación de entrega/lectura: el `lastRead*`/`lastDelivered*` de un
  /// miembro avanzó. `kind` distingue cuál de los dos cambió — ver
  /// `markConversationRead`/`markDelivered` en conversation.service.ts.
  RECEIPT_UPDATED: "conversation:receipt_updated",
} as const;

type JoinAck = (response: { ok: true } | { ok: false; error: string }) => void;

/// Conecta los listeners de este módulo a un socket recién conectado.
/// Registrada explícitamente en socket/registry.ts (ver ese archivo).
export function registerConversationSocket(socket: AppSocket, _io: AppServer): void {
  socket.on(CONVERSATION_EVENTS.JOIN, (conversationId: string, ack?: JoinAck) => {
    void handleJoin(socket, conversationId, ack);
  });

  socket.on(CONVERSATION_EVENTS.LEAVE, (conversationId: string, ack?: JoinAck) => {
    leaveConversation(socket, conversationId);
    ack?.({ ok: true });
  });
}

async function handleJoin(socket: AppSocket, conversationId: string, ack?: JoinAck): Promise<void> {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) {
    return ack?.({ ok: false, error: "Unauthenticated" });
  }

  const isMember = await isConversationMember(conversationId, user.internalUserId);
  if (!isMember) {
    return ack?.({ ok: false, error: "Not a member of this conversation" });
  }

  joinConversation(socket, conversationId);
  ack?.({ ok: true });
}
