import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";
import type { StoredFile } from "@/features/files/types/file.types";

/** Ver backend/API.md, sección 6 (Mensajes). */

/** `STICKER` siempre trae `content: ""` y exactamente un `files[]` — se
 * renderiza sin fondo de burbuja (ver MessageBubble.tsx). Un GIF, en cambio,
 * viaja como `TEXT` normal con un adjunto `image/gif` — no tiene tipo propio.
 * `CONTACT` almacena el contacto serializado en `content` y se renderiza como tarjeta.
 * `POLL` representa una encuesta interactiva dentro de grupos. */
export type MessageType = "TEXT" | "SYSTEM" | "STICKER" | "CONTACT" | "POLL" | "CALL";

/** Contenido de un mensaje `CONTACT`. Lo arma el servidor con los datos reales de la
 * cuenta (ver `buildCanonicalContactContent`, backend/src/modules/messages/message.service.ts);
 * la foto se resuelve con `avatarFileId`. */
export interface ContactMessagePayload {
  id: string;
  name: string;
  username?: string | null;
  email: string;
  avatarFileId?: string | null;
  /** Solo en tarjetas viejas, guardadas antes de que el servidor armara el contenido:
   * se usa únicamente si apunta al backend (ver `isBackendFileUrl`). */
  avatarUrl?: string | null;
}

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
   * "Mensaje eliminado" / "Nota de voz" / "GIF" / "Archivo adjunto" / el texto
   * tal cual (ver `MessagePreviewLabel.parseMessagePreview`). */
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

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  userName?: string;
  emoji: string;
  createdAt: string;
}

export interface MessageReactionUpdatedEvent {
  conversationId: string;
  messageId: string;
  reactions: MessageReaction[];
  userId: string;
  emoji: string;
  /// "updated": el usuario reemplazó su reacción anterior por este emoji.
  action: "added" | "removed" | "updated";
}

export interface PollVote {
  id: string;
  optionId: string;
  userId: string;
  userName?: string;
  createdAt: string;
}

export interface PollOption {
  id: string;
  pollId: string;
  text: string;
  order: number;
  votes: PollVote[];
  voteCount: number;
}

export interface Poll {
  id: string;
  messageId: string;
  question: string;
  allowMultiple: boolean;
  options: PollOption[];
  totalVotes: number;
  createdAt: string;
}

export interface CreatePollPayload {
  question: string;
  options: string[];
  allowMultiple?: boolean;
}

export interface PollVotedEvent {
  conversationId: string;
  messageId: string;
  poll: Poll;
  userId: string;
  optionId: string;
  action: "added" | "removed";
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
  reactions?: MessageReaction[];
  poll?: Poll | null;
}

export interface SendMessageInput {
  content?: string;
  fileIds?: string[];
  replyToId?: string;
  /** `"STICKER"`, `"CONTACT"` o `"POLL"`. Omitido para todo lo demás (texto, GIF, notas de voz, adjuntos). */
  type?: "STICKER" | "CONTACT" | "POLL";
  poll?: CreatePollPayload;
}

export interface EditMessageInput {
  content: string;
}

export interface ListMessagesQuery {
  before?: string;
  limit?: number;
  query?: string;
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
  /** `"STICKER"` si el mensaje que lo mandó es un sticker de Giphy — ver
   * `MessagePreviewLabel`/`ConversationDetailPanel`, distingue un sticker de
   * una imagen o GIF cualquiera aunque comparta el mismo `mimeType`. */
  messageType?: MessageType;
}

export interface ListConversationFilesQuery {
  before?: string;
  limit?: number;
}
