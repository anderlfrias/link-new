import { MessageType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const withRelations = {
  sender: { select: { id: true, name: true, email: true, avatarFileId: true } },
  files: { include: { file: true } },
  reactions: {
    select: {
      id: true,
      messageId: true,
      userId: true,
      emoji: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  },
  // Sin filtrar `deletedAt` acá tampoco (mismo criterio que `files[].file` más
  // abajo, ver README): si el original se borra después, la cita debe poder
  // seguir mostrando quién lo mandó y que fue borrado, no desaparecer.
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      deletedAt: true,
      type: true,
      files: {
        select: {
          id: true,
          file: {
            select: {
              mimeType: true,
              originalName: true,
            },
          },
        },
      },
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
  poll: {
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            select: {
              id: true,
              optionId: true,
              userId: true,
              createdAt: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MessageInclude;

const fileWithRelations = {
  file: true,
  message: { select: { id: true, createdAt: true, senderId: true, type: true } },
} satisfies Prisma.MessageFileInclude;

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
  poll?: {
    question: string;
    options: string[];
    allowMultiple?: boolean;
  };
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
        poll: data.poll
          ? {
              create: {
                question: data.poll.question,
                allowMultiple: data.poll.allowMultiple ?? false,
                options: {
                  create: data.poll.options.map((text, idx) => ({
                    text,
                    order: idx,
                  })),
                },
              },
            }
          : undefined,
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
export function listMessages(conversationId: string, options: { beforeId?: string; limit: number; query?: string }) {
  const trimmedQuery = options.query?.trim();
  return prisma.message.findMany({
    where: {
      conversationId,
      ...(trimmedQuery
        ? {
            deletedAt: null,
            content: {
              contains: trimmedQuery,
              mode: "insensitive",
            },
          }
        : {}),
    },
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

/// "Borrar para todos". Marca el mensaje como borrado (`deletedAt`/`deletedById`,
/// que siguen siendo la única señal de que existió) y descarta su contenido en
/// la misma transacción: el texto, la encuesta (con sus opciones y votos, que
/// caen por `ON DELETE CASCADE`) y la relación con sus archivos (`MessageFile`).
/// Las reacciones y la auditoría se conservan: no son contenido. El archivo en
/// sí (`StoredFile`) no se toca: si ya no lo usa ningún mensaje, avatar ni
/// grupo, lo recoge el worker de archivos huérfanos (ver upload-cleanup.worker.ts).
/// Es irreversible: nada de la UI lee el contenido de un mensaje borrado.
export async function softDelete(messageId: string, deletedById: string) {
  const [deleted] = await prisma.$transaction([
    prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedById, content: "" },
    }),
    prisma.poll.deleteMany({ where: { messageId } }),
    prisma.messageFile.deleteMany({ where: { messageId } }),
  ]);
  return deleted;
}

/// Usado por el worker de retención (`src/workers/message-retention.worker.ts`)
/// para el borrado automático por `AppSettings.messageRetentionDays`. Hace lo
/// mismo que `softDelete` (descartar texto, encuesta y relación con archivos,
/// todo en una transacción), pero sin `deletedById` (no lo borró un usuario) y en
/// lote — devuelve cuántos mensajes marcó, para logging.
export async function softDeleteOlderThan(cutoffDate: Date): Promise<number> {
  // Mismo criterio para las tres operaciones. Las dos primeras corren antes del
  // update: después ya no matchearían (`deletedAt` dejaría de ser null).
  const expired = { createdAt: { lt: cutoffDate }, deletedAt: null };
  const [, , result] = await prisma.$transaction([
    prisma.poll.deleteMany({ where: { message: expired } }),
    prisma.messageFile.deleteMany({ where: { message: expired } }),
    prisma.message.updateMany({ where: expired, data: { deletedAt: new Date(), content: "" } }),
  ]);
  return result.count;
}

export function findUserReaction(messageId: string, userId: string) {
  return prisma.messageReaction.findUnique({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });
}

export function addReaction(messageId: string, userId: string, emoji: string) {
  return prisma.messageReaction.create({
    data: {
      messageId,
      userId,
      emoji,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export function updateReaction(messageId: string, userId: string, emoji: string) {
  return prisma.messageReaction.update({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
    data: {
      emoji,
      createdAt: new Date(),
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}

export function removeReaction(messageId: string, userId: string) {
  return prisma.messageReaction.delete({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });
}

export function getMessageReactions(messageId: string) {
  return prisma.messageReaction.findMany({
    where: { messageId },
    select: {
      id: true,
      messageId: true,
      userId: true,
      emoji: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function findPollByMessageId(messageId: string) {
  return prisma.poll.findUnique({
    where: { messageId },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            select: {
              id: true,
              optionId: true,
              userId: true,
              createdAt: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

export function findPollOption(optionId: string) {
  return prisma.pollOption.findUnique({
    where: { id: optionId },
    include: { poll: true },
  });
}

export function togglePollVote(pollId: string, optionId: string, userId: string, allowMultiple: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.pollVote.findUnique({
      where: { optionId_userId: { optionId, userId } },
    });

    let action: "added" | "removed" = "added";
    if (existing) {
      await tx.pollVote.delete({
        where: { id: existing.id },
      });
      action = "removed";
    } else {
      if (!allowMultiple) {
        const pollOptions = await tx.pollOption.findMany({
          where: { pollId },
          select: { id: true },
        });
        const optionIds = pollOptions.map((o) => o.id);
        await tx.pollVote.deleteMany({
          where: {
            userId,
            optionId: { in: optionIds },
          },
        });
      }
      await tx.pollVote.create({
        data: {
          optionId,
          userId,
        },
      });
      action = "added";
    }

    const updatedPoll = await tx.poll.findUniqueOrThrow({
      where: { id: pollId },
      include: {
        options: {
          orderBy: { order: "asc" },
          include: {
            votes: {
              select: {
                id: true,
                optionId: true,
                userId: true,
                createdAt: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    return { updatedPoll, action };
  });
}
