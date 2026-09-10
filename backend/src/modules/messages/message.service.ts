import { ChatAuditAction, ConversationType, MessageFile, MessageType, StoredFile } from "@prisma/client";
import {
  assertMembership,
  buildLastMessagePreview,
  computeReceipts,
  markDelivered,
} from "../conversations/conversation.service";
import * as ConversationRepository from "../conversations/conversation.repository";
import { CONVERSATION_EVENTS } from "../conversations/conversation.socket";
import { ConversationMemberWithUser, ConversationWithMembers, MessageReceipt } from "../conversations/conversation.types";
import { toStoredFileResponse } from "../files/file.service";
import * as PushService from "../push/push.service";
import * as SettingsService from "../settings/settings.service";
import { getIO } from "../../socket";
import { conversationRoomName, getConnectedUserIds, userRoomName } from "../../socket/rooms";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as MessageRepository from "./message.repository";
import { MESSAGE_EVENTS } from "./message.socket";
import {
  ConversationFileResponse,
  CreateMessageInput,
  ForwardedFromPreview,
  ListConversationFilesOptions,
  ListMessagesOptions,
  MessageReplyPreview,
  MessageWithReceipts,
  MessageWithRelations,
  SerializableStoredFile,
  UpdateMessageInput,
} from "./message.types";

/// `MessageRepository.createMessage`/`listMessages`/`updateContent` traen
/// `replyTo` con la forma cruda del `select` de Prisma (ver `withRelations` en
/// message.repository.ts) — este módulo, no el repositorio, es quien conoce
/// `buildLastMessagePreview` (capa de servicio, ver conversation.service.ts),
/// así que la conversión al shape público (`MessageReplyPreview`) vive acá.
function toReplyPreview(
  raw: { id: string; senderId: string; content: string; deletedAt: Date | null; files: { id: string }[]; sender: { name: string } } | null,
): MessageReplyPreview | null {
  if (!raw) return null;
  return {
    id: raw.id,
    senderId: raw.senderId,
    senderName: raw.sender.name,
    preview: buildLastMessagePreview(raw),
    deletedAt: raw.deletedAt,
  };
}

/// Mismo criterio que `toReplyPreview` — `forwardedFrom` también trae la
/// forma cruda del `select` de Prisma y se traduce acá. A propósito no trae
/// nada de la conversación de origen (ver `ForwardedFromPreview`).
function toForwardedFromPreview(
  raw: { id: string; senderId: string; sender: { name: string } } | null,
): ForwardedFromPreview | null {
  if (!raw) return null;
  return { id: raw.id, senderId: raw.senderId, senderName: raw.sender.name };
}

/// `StoredFile.size` es `bigint` en Prisma — sin convertir a `number` acá,
/// tanto `res.json()` como el emit de socket.io explotan apenas un mensaje
/// trae un adjunto (`JSON.stringify` no sabe serializar `bigint`, ver
/// LARGE_FILES_PLAN.md §13, Riesgo 3). No reduce `file` a su forma pública
/// (eso es `toStoredFileResponse`, ver SerializableStoredFile en
/// message.types.ts) — a propósito, ese cambio de contrato mayor queda
/// diferido a una fase posterior de ese plan.
function toSerializableFiles(
  files: (MessageFile & { file: StoredFile })[],
): (MessageFile & { file: SerializableStoredFile })[] {
  return files.map((entry) => ({ ...entry, file: { ...entry.file, size: Number(entry.file.size) } }));
}

function withPreviews<
  T extends {
    replyTo: Parameters<typeof toReplyPreview>[0];
    forwardedFrom: Parameters<typeof toForwardedFromPreview>[0];
    files: (MessageFile & { file: StoredFile })[];
  },
>(message: T) {
  // Desestructurar (en vez de spread-y-reescribir) para que TS calcule bien
  // el tipo de `rest` sin `replyTo`/`forwardedFrom`/`files` — spreadear un
  // `T` genérico y "pisar" una clave después no reemplaza su tipo de forma
  // confiable en la inferencia.
  const { replyTo, forwardedFrom, files, ...rest } = message;
  return {
    ...rest,
    replyTo: toReplyPreview(replyTo),
    forwardedFrom: toForwardedFromPreview(forwardedFrom),
    files: toSerializableFiles(files),
  };
}

/// Avisa a cada miembro (en su room personal, no la de la conversación) que
/// el "último mensaje" de la conversación cambió, para que su lista de
/// conversaciones se refresque sola aunque no tengan esta conversación
/// abierta — la room de conversación sola no alcanza para eso (ver
/// use-conversations.ts en el frontend, que reacciona a este mismo evento).
/// También desoculta el chat ("Eliminar chat", ver ConversationMember.hiddenAt
/// en conversation.service.ts#deleteConversation) para TODOS los miembros que
/// lo hubieran ocultado, incluido el propio remitente — si yo oculté un chat
/// y le vuelvo a escribir, también tiene que reaparecerme a mí. El
/// `updateMany` de clearHiddenForMembers ya filtra `hiddenAt: { not: null }`,
/// así que en el caso normal (nadie lo ocultó) es una escritura de 0 filas.
async function notifyConversationListChanged(
  members: ConversationMemberWithUser[],
  conversationId: string,
): Promise<void> {
  await ConversationRepository.clearHiddenForMembers(
    conversationId,
    members.map((member) => member.userId),
  );
  const io = getIO();
  members.forEach((member) => {
    io.to(userRoomName(member.userId)).emit(CONVERSATION_EVENTS.UPDATED, { conversationId });
  });
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

async function assertOwnedMessage(conversationId: string, messageId: string): Promise<MessageWithRelations> {
  const message = await MessageRepository.findById(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new NotFoundError("Message not found");
  }
  return withPreviews(message);
}

/// Ventanas de tiempo configurables (ver AppSettings, allowMessageEdit/
/// allowMessageDeleteForEveryone y sus *TimeLimitMinutes en
/// settings/README.md) — `limitMinutes` null significa sin límite.
function assertWithinTimeLimit(sentAt: Date, limitMinutes: number | null, action: string): void {
  if (limitMinutes == null) return;
  const elapsedMinutes = (Date.now() - sentAt.getTime()) / 60_000;
  if (elapsedMinutes > limitMinutes) {
    throw new ForbiddenError(`The time window to ${action} this message has expired`);
  }
}

interface CreateAndDeliverParams {
  content: string;
  fileIds?: string[];
  replyToId?: string;
  forwardedFromId?: string;
  auditAction: ChatAuditAction;
  type?: MessageType;
}

/// Núcleo compartido por `sendMessage` y `forwardMessage`: crear la fila,
/// auditarla, calcular entrega/recibos, emitir por socket, refrescar la
/// lista de conversaciones de cada miembro, y mandar push a quien no está
/// conectado. Lo único que cambia entre las dos es CÓMO se validó/armó
/// `content`/`fileIds` antes de llegar acá, y qué `ChatAuditAction` corresponde.
async function createAndDeliverMessage(
  currentUserId: string,
  conversationId: string,
  conversation: ConversationWithMembers,
  params: CreateAndDeliverParams,
): Promise<MessageWithReceipts> {
  const message = await MessageRepository.createMessage({
    conversationId,
    senderId: currentUserId,
    content: params.content,
    type: params.type,
    fileIds: params.fileIds,
    replyToId: params.replyToId,
    forwardedFromId: params.forwardedFromId,
  });

  await MessageRepository.logAudit({
    userId: currentUserId,
    action: params.auditAction,
    conversationId,
    messageId: message.id,
  });

  // Quien ya está conectado a la room lo recibe en el acto: eso ES "entregado"
  // (ver markDelivered en conversation.service.ts). El resto queda en "sent"
  // hasta que se conecte o pida el historial (ver listMessages más abajo).
  const io = getIO();
  const connectedUserIds = await getConnectedUserIds(io, conversationId);
  const deliveredNow = new Set(connectedUserIds.filter((userId) => userId !== currentUserId));
  await Promise.all(
    Array.from(deliveredNow).map((userId) =>
      markDelivered(conversationId, userId, message.id, message.createdAt, conversation.members),
    ),
  );

  const receipts: MessageReceipt[] = conversation.members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => ({
      userId: member.userId,
      status: deliveredNow.has(member.userId) ? "delivered" : "sent",
    }));

  const messageWithReceipts: MessageWithReceipts = { ...withPreviews(message), receipts };
  io.to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.CREATED, messageWithReceipts);
  await notifyConversationListChanged(conversation.members, conversationId);

  // Web Push para quien no tiene ESTA conversación abierta ahora mismo —
  // reutiliza `deliveredNow` (arriba) en vez de recalcular "quién está
  // conectado", porque es exactamente la misma pregunta. A diferencia de la
  // room de socket, un push llega aunque la pestaña esté cerrada o el
  // navegador entero cerrado (ver push/README.md) — por eso vale la pena
  // mandarlo incluso a quien tiene la app abierta pero en OTRA conversación.
  // No se espera (`void`): un push lento o caído nunca debe demorar ni tumbar
  // la respuesta de este POST.
  const offlineMemberIds = conversation.members
    .map((member) => member.userId)
    .filter((userId) => userId !== currentUserId && !deliveredNow.has(userId));
  if (offlineMemberIds.length > 0) {
    const preview = buildLastMessagePreview(message);
    const isGroup = conversation.type === ConversationType.GROUP;
    void PushService.notifyUsers(offlineMemberIds, {
      title: isGroup ? (conversation.name ?? "Grupo") : message.sender.name,
      body: isGroup ? `${message.sender.name}: ${preview}` : preview,
      url: `/conversations/${conversationId}`,
      tag: conversationId,
    });
  }

  return messageWithReceipts;
}

export async function sendMessage(
  currentUserId: string,
  conversationId: string,
  input: CreateMessageInput,
): Promise<MessageWithReceipts> {
  const conversation = await assertMembership(conversationId, currentUserId);

  const fileIds = Array.from(new Set(input.fileIds ?? []));
  if (fileIds.length > 0) {
    const settings = await SettingsService.getSettings();
    if (settings.maxFilesPerMessage != null && fileIds.length > settings.maxFilesPerMessage) {
      throw new BadRequestError(`A message can include at most ${settings.maxFilesPerMessage} files`);
    }

    const existingFiles = await MessageRepository.countExistingFiles(fileIds);
    if (existingFiles !== fileIds.length) {
      throw new BadRequestError("One or more files do not exist");
    }
  }

  // No filtra `deletedAt` (ver `existsInConversation`): responder a un mensaje
  // que se borró justo mientras el usuario tenía la cita armada en su
  // composer debe seguir funcionando, igual que WhatsApp/Telegram.
  if (input.replyToId && !(await MessageRepository.existsInConversation(input.replyToId, conversationId))) {
    throw new BadRequestError("El mensaje al que querés responder ya no existe en esta conversación.");
  }

  return createAndDeliverMessage(currentUserId, conversationId, conversation, {
    content: input.content.trim(),
    fileIds,
    replyToId: input.replyToId,
    auditAction: ChatAuditAction.SEND_MESSAGE,
    type: input.type === "STICKER" ? MessageType.STICKER : undefined,
  });
}

/// Reenviar un mensaje existente (de cualquier conversación donde el usuario
/// sea miembro, no solo la de destino) a `conversationId`. El reenvío es una
/// COPIA independiente de `content`/adjuntos — no un puntero "vacío" que
/// dependa de que el original siga existiendo (mismo criterio que Telegram:
/// si borrás el original después, el reenvío ya hecho sigue teniendo su
/// propio contenido). `forwardedFromId` solo se usa para reconstruir la
/// atribución ("Reenviado de X — ver ForwardedFromPreview") al leer.
export async function forwardMessage(
  currentUserId: string,
  conversationId: string,
  sourceMessageId: string,
): Promise<MessageWithReceipts> {
  const conversation = await assertMembership(conversationId, currentUserId);

  const source = await MessageRepository.findById(sourceMessageId);
  if (!source) {
    throw new NotFoundError("Message not found");
  }
  // Nunca vale reenviar algo que no podés ver vos mismo — sin importar que
  // el destino sea una conversación distinta de la de origen.
  await assertMembership(source.conversationId, currentUserId);

  return createAndDeliverMessage(currentUserId, conversationId, conversation, {
    content: source.content,
    fileIds: source.files.map((file) => file.fileId),
    forwardedFromId: source.id,
    auditAction: ChatAuditAction.FORWARD_MESSAGE,
  });
}

export async function listMessages(
  currentUserId: string,
  conversationId: string,
  options: ListMessagesOptions,
): Promise<MessageWithReceipts[]> {
  const conversation = await assertMembership(conversationId, currentUserId);

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const messages = await MessageRepository.listMessages(conversationId, { beforeId: options.beforeId, limit });
  const ordered = messages.reverse();

  // Pedir el historial también cuenta como "entregado" para quien lo pide:
  // alcanza con avanzar el puntero hasta el mensaje más nuevo de esta página
  // (markDelivered ya se encarga de no retroceder si ya estaba más adelante).
  const newest = ordered[ordered.length - 1];
  if (newest) {
    await markDelivered(conversationId, currentUserId, newest.id, newest.createdAt, conversation.members);
  }

  return ordered.map((message) => ({
    ...withPreviews(message),
    receipts: computeReceipts(conversation.members, message),
  }));
}

/// Archivos compartidos en la conversación, para el panel de detalle (tipo
/// WhatsApp/Telegram) — misma paginación por cursor que `listMessages`.
export async function listConversationFiles(
  currentUserId: string,
  conversationId: string,
  options: ListConversationFilesOptions,
): Promise<ConversationFileResponse[]> {
  await assertMembership(conversationId, currentUserId);

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const entries = await MessageRepository.listFiles(conversationId, { beforeId: options.beforeId, limit });

  return entries.map((entry) => ({
    ...toStoredFileResponse(entry.file),
    messageId: entry.message.id,
    senderId: entry.message.senderId,
  }));
}

export async function editMessage(
  currentUserId: string,
  conversationId: string,
  messageId: string,
  input: UpdateMessageInput,
): Promise<MessageWithReceipts> {
  const conversation = await assertMembership(conversationId, currentUserId);
  const message = await assertOwnedMessage(conversationId, messageId);

  if (message.senderId !== currentUserId) {
    throw new ForbiddenError("You can only edit your own messages");
  }
  if (message.type !== MessageType.TEXT) {
    throw new BadRequestError("Only text messages can be edited");
  }

  const settings = await SettingsService.getSettings();
  if (!settings.allowMessageEdit) {
    throw new ForbiddenError("Message editing is disabled");
  }
  assertWithinTimeLimit(message.createdAt, settings.messageEditTimeLimitMinutes, "edit");

  const updated = await MessageRepository.updateContent(messageId, input.content.trim());
  await MessageRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.EDIT_MESSAGE,
    conversationId,
    messageId,
  });

  const messageWithReceipts: MessageWithReceipts = {
    ...withPreviews(updated),
    receipts: computeReceipts(conversation.members, updated),
  };

  getIO().to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.UPDATED, messageWithReceipts);
  // Solo importa para la lista de conversaciones si justo edité el último
  // mensaje — editar uno viejo no cambia lo que se muestra ahí.
  if (messageId === conversation.lastMessageId) {
    await notifyConversationListChanged(conversation.members, conversationId);
  }
  return messageWithReceipts;
}

export async function deleteMessage(currentUserId: string, conversationId: string, messageId: string) {
  const conversation = await assertMembership(conversationId, currentUserId);
  const message = await assertOwnedMessage(conversationId, messageId);

  const isOwnMessage = message.senderId === currentUserId;
  if (!isOwnMessage && conversation.createdById !== currentUserId) {
    throw new ForbiddenError("Only the message author or the conversation creator can delete this message");
  }

  // Las reglas de allowMessageDeleteForEveryone/tiempo límite solo gobiernan
  // que el propio autor borre SU mensaje — el creador de la conversación
  // borrando un mensaje ajeno es moderación (mismo criterio que expulsar un
  // miembro) y nunca debe depender de esta configuración de autoservicio.
  if (isOwnMessage) {
    const settings = await SettingsService.getSettings();
    if (!settings.allowMessageDeleteForEveryone) {
      throw new ForbiddenError("Deleting messages for everyone is disabled");
    }
    assertWithinTimeLimit(message.createdAt, settings.messageDeleteForEveryoneTimeLimitMinutes, "delete");
  }

  const deleted = await MessageRepository.softDelete(messageId, currentUserId);
  await MessageRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.DELETE_MESSAGE,
    conversationId,
    messageId,
    metadata: { deletedOwnMessage: isOwnMessage },
  });

  // A diferencia de CREATED/UPDATED, el payload NO manda el mensaje completo
  // (nunca vuelve a viajar `content`/`files` una vez borrado) — solo lo
  // necesario para que cada cliente conectado (incluido quien borró) lo
  // marque como "Mensaje eliminado" en el momento, sin sacarlo de la vista.
  // `GET /` sigue excluyéndolo del historial (ver MessageRepository.listMessages).
  const payload = { conversationId, messageId, deletedAt: deleted.deletedAt };
  getIO().to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.DELETED, payload);
  if (messageId === conversation.lastMessageId) {
    await notifyConversationListChanged(conversation.members, conversationId);
  }
  return payload;
}
