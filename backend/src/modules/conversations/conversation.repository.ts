import { ChatAuditAction, ConversationType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const withMembers = {
  members: {
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarFileId: true, status: true },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

export function findActiveById(conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, deletedAt: null },
    include: withMembers,
  });
}

export function findPrivateConversationBetween(userAId: string, userBId: string) {
  return prisma.conversation.findFirst({
    where: {
      type: ConversationType.PRIVATE,
      deletedAt: null,
      AND: [{ members: { some: { userId: userAId } } }, { members: { some: { userId: userBId } } }],
    },
    include: withMembers,
  });
}

export function countExistingUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return Promise.resolve(0);
  return prisma.user.count({ where: { id: { in: userIds } } });
}

export function createConversation(data: {
  type: ConversationType;
  name?: string;
  imageFileId?: string;
  createdById: string;
  memberIds: string[];
}) {
  return prisma.conversation.create({
    data: {
      type: data.type,
      name: data.name,
      imageFileId: data.imageFileId,
      createdById: data.createdById,
      members: { create: data.memberIds.map((userId) => ({ userId })) },
    },
    include: withMembers,
  });
}

export function listForUser(userId: string) {
  return prisma.conversation.findMany({
    where: { deletedAt: null, members: { some: { userId } } },
    include: withMembers,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return membership !== null;
}

export function addMembers(conversationId: string, userIds: string[]) {
  return prisma.conversationMember.createMany({
    data: userIds.map((userId) => ({ conversationId, userId })),
    skipDuplicates: true,
  });
}

export function removeMember(conversationId: string, userId: string) {
  return prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export function updateDetails(conversationId: string, data: { name?: string; imageFileId?: string | null }) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data,
    include: withMembers,
  });
}

export function softDelete(conversationId: string) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { deletedAt: new Date() },
  });
}

export function markRead(conversationId: string, userId: string, lastReadMessageId?: string) {
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: {
      lastReadAt: new Date(),
      ...(lastReadMessageId ? { lastReadMessageId } : {}),
    },
  });
}

/// Avanza el puntero de "entregado" solo si `deliveredThrough` es más reciente
/// que el actual — nunca retrocede (ej. si el miembro pagina hacia mensajes más
/// viejos después de ya haber recibido mensajes más nuevos en vivo). El `WHERE`
/// se evalúa atómicamente en la base, así que es seguro bajo requests concurrentes.
export async function markDelivered(
  conversationId: string,
  userId: string,
  messageId: string,
  deliveredThrough: Date,
): Promise<boolean> {
  const result = await prisma.conversationMember.updateMany({
    where: {
      conversationId,
      userId,
      OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: deliveredThrough } }],
    },
    data: { lastDeliveredMessageId: messageId, lastDeliveredAt: deliveredThrough },
  });
  return result.count > 0;
}

export function countUnread(conversationId: string, userId: string, since: Date | null) {
  return prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      senderId: { not: userId },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}

export function logAudit(params: {
  userId: string;
  action: ChatAuditAction;
  conversationId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.chatAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      conversationId: params.conversationId,
      metadata: params.metadata,
    },
  });
}
