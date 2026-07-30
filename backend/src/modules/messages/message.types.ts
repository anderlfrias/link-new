import { Message, MessageFile, StoredFile, User } from "@prisma/client";
import { MessageReceipt } from "../conversations/conversation.types";

export interface CreateMessageInput {
  content: string;
  /// Ids de `StoredFile` ya existentes a adjuntar. Este módulo no sube
  /// archivos (ver `../files`), solo referencia los ya subidos ahí.
  fileIds?: string[];
}

export interface UpdateMessageInput {
  content: string;
}

export interface ListMessagesOptions {
  /// Id del mensaje más antiguo ya cargado por el cliente (paginación por cursor).
  beforeId?: string;
  limit?: number;
}

export interface ListConversationFilesOptions {
  /// Id del `MessageFile` más antiguo ya cargado por el cliente (paginación por cursor).
  beforeId?: string;
  limit?: number;
}

/// Un archivo compartido en la conversación, con el mínimo de contexto del
/// mensaje que lo mandó — para el panel de detalle (ver `message.service.ts`,
/// `listConversationFiles`).
export interface ConversationFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  createdAt: Date;
  messageId: string;
  senderId: string;
}

export type MessageWithRelations = Message & {
  sender: Pick<User, "id" | "name" | "email" | "avatarFileId">;
  files: (MessageFile & { file: StoredFile })[];
};

/// Forma pública de un mensaje: la relación con sus destinatarios (todo
/// miembro salvo el propio autor) — ver `computeReceipts` en
/// `../conversations/conversation.service.ts`.
export type MessageWithReceipts = MessageWithRelations & {
  receipts: MessageReceipt[];
};
