import { Message, MessageFile, StoredFile, User } from "@prisma/client";
import { MessageReceipt } from "../conversations/conversation.types";

export interface CreateMessageInput {
  content: string;
  /// Ids de `StoredFile` ya existentes a adjuntar. Este módulo no sube
  /// archivos (ver `../files`), solo referencia los ya subidos ahí.
  fileIds?: string[];
  /// Mensaje al que este responde (tipo WhatsApp/Telegram) — debe pertenecer
  /// a la misma conversación, se valida en `sendMessage` (message.service.ts).
  replyToId?: string;
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

/// Vista resumida del mensaje original, embebida en la respuesta del que
/// responde — evita un round-trip aparte para mostrar la cita (mismo criterio
/// que `sender`/`files` acá al lado). `preview` sale de `buildLastMessagePreview`
/// (`../conversations/conversation.service.ts`) — mismo texto que ya se usa para
/// la lista de conversaciones y el cuerpo del push, así "Mensaje eliminado" /
/// "📎 Archivo adjunto" nunca queda inconsistente entre pantallas.
export interface MessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  preview: string;
  deletedAt: Date | null;
}

export type MessageWithRelations = Message & {
  sender: Pick<User, "id" | "name" | "email" | "avatarFileId">;
  files: (MessageFile & { file: StoredFile })[];
  replyTo: MessageReplyPreview | null;
};

/// Forma pública de un mensaje: la relación con sus destinatarios (todo
/// miembro salvo el propio autor) — ver `computeReceipts` en
/// `../conversations/conversation.service.ts`.
export type MessageWithReceipts = MessageWithRelations & {
  receipts: MessageReceipt[];
};
