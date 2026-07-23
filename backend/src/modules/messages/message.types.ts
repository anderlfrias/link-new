import { Message, MessageFile, StoredFile, User } from "@prisma/client";

export interface CreateMessageInput {
  content: string;
  /// Ids de `StoredFile` ya existentes a adjuntar. Este módulo no sube
  /// archivos (ver `src/storage` cuando exista), solo referencia los subidos.
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
