import { CallStatus, CallType } from "@prisma/client";
import { prisma } from "../../config/prisma";

const callUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarFileId: true,
  avatarFile: {
    select: {
      path: true,
    },
  },
};

export async function createCall(data: {
  conversationId: string;
  callerId: string;
  receiverId: string;
  type: CallType;
}) {
  return prisma.call.create({
    data: {
      conversationId: data.conversationId,
      callerId: data.callerId,
      receiverId: data.receiverId,
      type: data.type,
      status: CallStatus.RINGING,
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function findById(callId: string) {
  return prisma.call.findUnique({
    where: { id: callId },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function findActiveCallForUser(userId: string) {
  return prisma.call.findFirst({
    where: {
      OR: [{ callerId: userId }, { receiverId: userId }],
      status: {
        in: [CallStatus.RINGING, CallStatus.ACCEPTED],
      },
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  extra?: {
    answeredAt?: Date;
    endedAt?: Date;
    duration?: number;
  },
) {
  return prisma.call.update({
    where: { id: callId },
    data: {
      status,
      ...(extra?.answeredAt !== undefined && { answeredAt: extra.answeredAt }),
      ...(extra?.endedAt !== undefined && { endedAt: extra.endedAt }),
      ...(extra?.duration !== undefined && { duration: extra.duration }),
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function listCallsByConversation(conversationId: string, limit = 20) {
  return prisma.call.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}
