/** Ver backend/API.md, sección 4 (Conversaciones). */

export type ConversationType = "PRIVATE" | "GROUP";

export type UserStatus = "ACTIVE" | "INACTIVE";

/** Estado de entrega/lectura, ver backend/API.md sección 7. */
export type MessageReceiptStatus = "sent" | "delivered" | "read";

export interface ConversationMemberUser {
  id: string;
  name: string;
  email: string;
  avatarFileId: string | null;
  avatarFile: { path: string } | null;
  status: UserStatus;
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  lastDeliveredMessageId: string | null;
  lastDeliveredAt: string | null;
  user: ConversationMemberUser;
}

export interface Conversation {
  id: string;
  name: string | null;
  type: ConversationType;
  imageFileId: string | null;
  imageFile: { path: string } | null;
  createdById: string;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  members: ConversationMember[];
}

/** Forma devuelta únicamente por GET /api/v1/conversations (listado). */
export interface ConversationListItem extends Conversation {
  unreadCount: number;
  lastMessageStatus: MessageReceiptStatus | null;
  /** Preview ya resuelto del último mensaje (texto, "Mensaje eliminado", adjunto). `null` sin mensajes. */
  lastMessagePreview: string | null;
}

export interface CreatePrivateConversationInput {
  type: "PRIVATE";
  memberIds: [string];
}

export interface CreateGroupConversationInput {
  type: "GROUP";
  memberIds: string[];
  name: string;
  imageFileId?: string;
}

export type CreateConversationInput =
  | CreatePrivateConversationInput
  | CreateGroupConversationInput;

export interface UpdateConversationInput {
  name?: string;
  imageFileId?: string | null;
}
