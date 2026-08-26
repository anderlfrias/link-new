import { ChatAuditAction, ConversationGroupSettings, ConversationType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const withMembers = {
  imageFile: { select: { path: true } },
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarFileId: true,
          avatarFile: { select: { path: true } },
          status: true,
        },
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
      members: {
        create: data.memberIds.map((userId) => ({ userId, isAdmin: userId === data.createdById })),
      },
    },
    include: withMembers,
  });
}

export function listForUser(userId: string) {
  return prisma.conversation.findMany({
    where: {
      deletedAt: null,
      members: { some: { userId } },
      // Una conversación PRIVATE recién creada (sin ningún mensaje) todavía no
      // "existe" para nadie: evita que abrir un contacto nuevo le muestre un
      // chat vacío a la otra persona antes de que se mande el primer mensaje.
      // GROUP sí aparece de una — crearlo ya es una acción explícita con
      // miembros elegidos, no una simple apertura de contacto.
      OR: [{ type: ConversationType.GROUP }, { lastMessageId: { not: null } }],
    },
    include: withMembers,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });
}

/// Trae en un solo query el contenido de varios `lastMessageId` a la vez, para
/// que la lista de conversaciones pueda mostrar un preview sin un N+1 (un
/// query de `Message` por conversación). No es un `include` de Prisma porque
/// `lastMessageId` no es una relación (ver comentario en el modelo).
export function findLastMessagesByIds(messageIds: string[]) {
  if (messageIds.length === 0) return Promise.resolve([]);
  return prisma.message.findMany({
    where: { id: { in: messageIds } },
    select: {
      id: true,
      type: true,
      content: true,
      deletedAt: true,
      files: { select: { id: true }, take: 1 },
    },
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

export function setMemberAdmin(conversationId: string, userId: string, isAdmin: boolean) {
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { isAdmin },
  });
}

export function setMemberPinned(conversationId: string, userId: string, isPinned: boolean) {
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { isPinned },
  });
}

export function setMemberFavorite(conversationId: string, userId: string, isFavorite: boolean) {
  return prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { isFavorite },
  });
}

export function findGroupSettings(conversationId: string): Promise<ConversationGroupSettings | null> {
  return prisma.conversationGroupSettings.findUnique({ where: { conversationId } });
}

export function upsertGroupSettings(
  conversationId: string,
  data: Partial<
    Pick<
      ConversationGroupSettings,
      "whoCanAddMembers" | "whoCanRemoveMembers" | "maxGroupMembers" | "whoCanChangeGroupInfo" | "whoCanDeleteGroup"
    >
  >,
): Promise<ConversationGroupSettings> {
  return prisma.conversationGroupSettings.upsert({
    where: { conversationId },
    create: { conversationId, ...data },
    update: data,
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
