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
}
