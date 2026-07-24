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
