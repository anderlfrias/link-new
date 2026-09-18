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
  /// Omitido (o ausente) = `TEXT`, el caso normal. `"STICKER"` es el único
  /// valor que un cliente puede pedir explícitamente (nunca `"SYSTEM"` — eso
  /// lo genera el propio backend, ver conversation.service.ts) — exige
  /// `content` vacío y exactamente un `fileId` (ver createMessageSchema,
  /// message.validator.ts, y el sticker importado antes vía
  /// `POST /api/v1/giphy/import`, ../giphy/README.md).
  type?: "STICKER";
}

/// Reenviar un mensaje puntual (de cualquier conversación donde seas
/// miembro) a `:conversationId`. Ver `forwardMessage` en message.service.ts.
export interface ForwardMessageInput {
  messageId: string;
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

/// Vista resumida de QUIÉN mandó el mensaje original de un reenvío — a
/// propósito NUNCA incluye nada de la conversación de origen (ni su id, ni su
/// nombre, ni su tipo): el destino de un reenvío puede tener miembros que no
/// pertenecen a esa conversación de origen, así que revelarla filtraría de
/// qué chat/grupo salió el mensaje a gente que no tiene por qué saberlo. Se
/// resuelve en vivo (no es una foto congelada al momento de reenviar) — mismo
/// criterio que `MessageReplyPreview`: si el remitente original cambia su
/// nombre después, este reenvío ya hecho lo refleja la próxima vez que se lea.
/// Además, el cliente solo muestra `senderName` cuando el DESTINO es la
/// conversación `SELF` de quien lo reenvía — en cualquier otro destino se
/// muestra únicamente que el mensaje fue reenviado, sin atribuirlo a nadie
/// (ver `frontend/src/features/messages/components/MessageBubble.tsx`).
export interface ForwardedFromPreview {
  id: string;
  senderId: string;
  senderName: string;
}

/// Forma pública de un `StoredFile` embebido en un mensaje después de
/// `withPreviews` (message.service.ts) — LARGE_FILES_PLAN.md Fase 2 (§5.2, S12).
/// Nunca expone rutas físicas (`path`, `storedName`) ni detalles internos
/// (`checksum`, `provider`, `createdById`). La `url` incluye el token HMAC
/// para lectura autorizada via `GET /api/v1/files/:id/content?t=<hmac>`.
export interface PublicStoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export type SerializableStoredFile = PublicStoredFile;

export interface MessageReactionResponse {
  id: string;
  messageId: string;
  userId: string;
  userName?: string;
  emoji: string;
  createdAt: Date;
}

export interface ToggleReactionInput {
  emoji: string;
}

export type MessageWithRelations = Message & {
  sender: Pick<User, "id" | "name" | "email" | "avatarFileId">;
  files: (MessageFile & { file: SerializableStoredFile })[];
  replyTo: MessageReplyPreview | null;
  forwardedFrom: ForwardedFromPreview | null;
  reactions: MessageReactionResponse[];
};

/// Forma pública de un mensaje: la relación con sus destinatarios (todo
/// miembro salvo el propio autor) — ver `computeReceipts` en
/// `../conversations/conversation.service.ts`.
export type MessageWithReceipts = MessageWithRelations & {
  receipts: MessageReceipt[];
};
