import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";
import type { StoredFile } from "@/features/files/types/file.types";

/** Ver backend/API.md, sección 6 (Mensajes). */

export type MessageType = "TEXT" | "SYSTEM";

export interface MessageSender {
  id: string;
  name: string;
  email: string;
  avatarFileId: string | null;
}

export interface MessageFile {
  id: string;
  messageId: string;
  fileId: string;
  createdAt: string;
  file: StoredFile;
}

export interface MessageReceipt {
  userId: string;
  status: MessageReceiptStatus;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  createdAt: string;
  sender: MessageSender;
  files: MessageFile[];
  receipts: MessageReceipt[];
}

export interface SendMessageInput {
  content: string;
  fileIds?: string[];
}

export interface EditMessageInput {
  content: string;
}

export interface ListMessagesQuery {
  before?: string;
  limit?: number;
}
