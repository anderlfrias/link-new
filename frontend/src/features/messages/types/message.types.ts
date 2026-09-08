import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";
import type { StoredFile } from "@/features/files/types/file.types";

/** Ver backend/API.md, sección 6 (Mensajes). */

/** `STICKER` siempre trae `content: ""` y exactamente un `files[]` — se
 * renderiza sin fondo de burbuja (ver MessageBubble.tsx). Un GIF, en cambio,
 * viaja como `TEXT` normal con un adjunto `image/gif` — no tiene tipo propio. */
export type MessageType = "TEXT" | "SYSTEM" | "STICKER";

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

/** Vista resumida del mensaje original citado — ver backend/API.md sección 6. */
export interface MessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  /** Mismo texto que `lastMessagePreview` de la conversación — ya resuelve
   * "Mensaje eliminado" / "📎 Archivo adjunto" / el texto tal cual. */
  preview: string;
  deletedAt: string | null;
}

/** Quién mandó el mensaje original de un reenvío — a propósito nunca incluye
 * nada de la conversación de origen (ver backend/API.md sección 6): el
 * destino puede tener miembros que no pertenecen a esa conversación, así que
 * revelarla filtraría de qué chat/grupo salió. Mostrar `senderName` en la UI
 * está limitado a cuando el destino es tu propia conversación `SELF` — ver
 * MessageBubble.tsx. */
export interface ForwardedFromPreview {
  id: string;
  senderId: string;
  senderName: string;
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
  replyToId: string | null;
  replyTo: MessageReplyPreview | null;
  forwardedFromId: string | null;
  forwardedFrom: ForwardedFromPreview | null;
  receipts: MessageReceipt[];
}

export interface SendMessageInput {
  content: string;
  fileIds?: string[];
  replyToId?: string;
  /** Solo `"STICKER"` — ver `MessageType`. Omitido para todo lo demás (texto, GIF, notas de voz, adjuntos). */
  type?: "STICKER";
}

export interface EditMessageInput {
  content: string;
}

export interface ListMessagesQuery {
  before?: string;
  limit?: number;
}

/** Ver backend/API.md, sección 6.4 (`GET /messages/files`). */
export interface ConversationFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  createdAt: string;
  messageId: string;
  senderId: string;
}

export interface ListConversationFilesQuery {
  before?: string;
  limit?: number;
}
