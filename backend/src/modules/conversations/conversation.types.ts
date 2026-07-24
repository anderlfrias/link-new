import { Conversation, ConversationMember, ConversationType, User } from "@prisma/client";

export interface CreateConversationInput {
  type: ConversationType;
  /// Ids internos de los demás participantes (sin incluir al creador).
  memberIds: string[];
  /// Requerido para GROUP, ignorado para PRIVATE.
  name?: string;
  /// Solo aplica a GROUP.
  imageFileId?: string;
}

export interface UpdateConversationInput {
  name?: string;
  /// `null` limpia la imagen del grupo.
  imageFileId?: string | null;
}

export type ConversationMemberWithUser = ConversationMember & {
  user: Pick<User, "id" | "name" | "email" | "avatarFileId" | "status">;
};

export type ConversationWithMembers = Conversation & {
  members: ConversationMemberWithUser[];
};

export interface ConversationListItem extends ConversationWithMembers {
  /// Mensajes de otros usuarios posteriores a `lastReadAt` del miembro actual.
  unreadCount: number;
  /// Estado de confirmación del último mensaje, **solo si lo envió el usuario
  /// actual** (no tiene sentido pedir un "recibo" de un mensaje ajeno).
  /// `null` si el usuario actual no es quien envió `lastMessageId`, o si la
  /// conversación todavía no tiene mensajes.
  lastMessageStatus: MessageReceiptStatus | null;
}

export type MessageReceiptStatus = "sent" | "delivered" | "read";

/// Estado de un mensaje para un miembro que no sea su propio autor. Ver
/// `computeReceipts`/`aggregateReceiptStatus` en conversation.service.ts.
export interface MessageReceipt {
  userId: string;
  status: MessageReceiptStatus;
}
