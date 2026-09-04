import { ChatAuditAction, MessageType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const withRelations = {
  sender: { select: { id: true, name: true, email: true, avatarFileId: true } },
  files: { include: { file: true } },
  // Sin filtrar `deletedAt` acá tampoco (mismo criterio que `files[].file` más
  // abajo, ver README): si el original se borra después, la cita debe poder
  // seguir mostrando quién lo mandó y que fue borrado, no desaparecer.
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      deletedAt: true,
      files: { select: { id: true } },
      sender: { select: { name: true } },
    },
  },
  // A propósito NUNCA se trae `conversationId`/`conversation` acá — ver el
  // comentario de `ForwardedFromPreview` en message.types.ts: filtraría de
  // qué chat/grupo salió un reenvío a miembros del destino que no pertenecen
  // a esa conversación de origen. Igual que `replyTo`: sin filtrar
  // `deletedAt` — el remitente sigue existiendo como fila aunque el mensaje
  // original se borre después.
  forwardedFrom: {
    select: {
      id: true,
      senderId: true,
      sender: { select: { name: true } },
    },
  },
} satisfies Prisma.MessageInclude;

const fileWithRelations = {
  file: true,
  message: { select: { id: true, createdAt: true, senderId: true } },
} satisfies Prisma.MessageFileInclude;

export function countExistingFiles(fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return Promise.resolve(0);
  return prisma.storedFile.count({ where: { id: { in: fileIds }, deletedAt: null } });
}

/// Crea el mensaje y actualiza el puntero denormalizado
/// `Conversation.lastMessageId`/`lastMessageAt` en una sola transacción — ver
/// backend/README.md ("¿Por qué existen lastReadMessageId y lastMessageAt?").
/// Mantenerlo al día es responsabilidad de este módulo: es quien lo hace stale.
export function createMessage(data: {
  conversationId: string;
  senderId: string;
  content: string;
  type?: MessageType;
  fileIds?: string[];
  replyToId?: string;
  forwardedFromId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        type: data.type ?? MessageType.TEXT,
        content: data.content,
        files: data.fileIds?.length ? { create: data.fileIds.map((fileId) => ({ fileId })) } : undefined,
        replyToId: data.replyToId,
        forwardedFromId: data.forwardedFromId,
      },
      include: withRelations,
    });

    await tx.conversation.update({
      where: { id: data.conversationId },
      data: { lastMessageId: message.id, lastMessageAt: message.createdAt, lastMessageSenderId: data.senderId },
    });

    return message;
  });
}

/// Paginación por cursor (`beforeId`), más reciente primero. El service
/// invierte el orden antes de responder para que el cliente reciba los
/// mensajes en orden cronológico ascendente.
export function listMessages(conversationId: string, options: { beforeId?: string; limit: number }) {
  return prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    include: withRelations,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.beforeId ? { cursor: { id: options.beforeId }, skip: 1 } : {}),
  });
}

/// Archivos compartidos en la conversación (a través de `MessageFile`), más
/// reciente primero — mismo criterio de paginación por cursor que
/// `listMessages` (el panel de detalle de la conversación, tipo
/// WhatsApp/Telegram, pagina esto igual que el historial de mensajes).
export function listFiles(conversationId: string, options: { beforeId?: string; limit: number }) {
  return prisma.messageFile.findMany({
    where: { message: { conversationId, deletedAt: null }, file: { deletedAt: null } },
    include: fileWithRelations,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.beforeId ? { cursor: { id: options.beforeId }, skip: 1 } : {}),
  });
}

export function findById(messageId: string) {
  return prisma.message.findFirst({ where: { id: messageId, deletedAt: null }, include: withRelations });
}

/// A diferencia de `findById`, no filtra `deletedAt`: valida `replyToId` al
/// mandar un mensaje (`sendMessage`, message.service.ts), y ahí un mensaje ya
/// borrado sigue siendo un destino válido para responder — solo debe existir
/// y pertenecer a la misma conversación, no importa si ya se borró mientras
/// tanto (ver comentario de `replyToId` en schema.prisma).
export async function existsInConversation(messageId: string, conversationId: string): Promise<boolean> {
  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
  return message !== null;
}

export function updateContent(messageId: string, content: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: withRelations,
  });
}

export function softDelete(messageId: string, deletedById: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), deletedById },
  });
}

/// Usado por el worker de retención (`src/workers/message-retention.worker.ts`)
/// para el borrado automático por `AppSettings.messageRetentionDays`. A
/// diferencia de `softDelete`, no tiene `deletedById` (no lo borró un
/// usuario) y opera en lote — devuelve cuántos mensajes marcó, para logging.
export async function softDeleteOlderThan(cutoffDate: Date): Promise<number> {
  const result = await prisma.message.updateMany({
    where: { createdAt: { lt: cutoffDate }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

export function logAudit(params: {
  userId: string;
  action: ChatAuditAction;
  conversationId: string;
  messageId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.chatAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      conversationId: params.conversationId,
      messageId: params.messageId,
      metadata: params.metadata,
    },
  });
}
