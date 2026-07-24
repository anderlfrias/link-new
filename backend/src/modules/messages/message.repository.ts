import { ChatAuditAction, MessageType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const withRelations = {
  sender: { select: { id: true, name: true, email: true, avatarFileId: true } },
  files: { include: { file: true } },
} satisfies Prisma.MessageInclude;

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
}) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        type: data.type ?? MessageType.TEXT,
        content: data.content,
        files: data.fileIds?.length ? { create: data.fileIds.map((fileId) => ({ fileId })) } : undefined,
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

export function findById(messageId: string) {
  return prisma.message.findFirst({ where: { id: messageId, deletedAt: null }, include: withRelations });
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
