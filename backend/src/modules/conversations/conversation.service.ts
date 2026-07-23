import { ChatAuditAction, ConversationType } from "@prisma/client";
import { getIO } from "../../socket";
import { conversationRoomName, userRoomName } from "../../socket/rooms";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as ConversationRepository from "./conversation.repository";
import { CONVERSATION_EVENTS } from "./conversation.socket";
import { ConversationWithMembers, CreateConversationInput, UpdateConversationInput } from "./conversation.types";

/// Exportada para que otros módulos con recursos anidados dentro de una
/// conversación (ej. `messages`) reutilicen la misma regla de autorización en
/// vez de duplicarla: conversación activa + el usuario es miembro.
export async function assertMembership(conversationId: string, userId: string): Promise<ConversationWithMembers> {
  const conversation = await ConversationRepository.findActiveById(conversationId);
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }
  if (!conversation.members.some((member) => member.userId === userId)) {
    throw new ForbiddenError("You are not a member of this conversation");
  }
  return conversation;
}

export async function createConversation(currentUserId: string, input: CreateConversationInput) {
  const otherMemberIds = Array.from(new Set(input.memberIds)).filter((id) => id !== currentUserId);

  if (input.type === ConversationType.PRIVATE) {
    if (otherMemberIds.length !== 1) {
      throw new BadRequestError("A private conversation requires exactly one other member");
    }

    const existing = await ConversationRepository.findPrivateConversationBetween(currentUserId, otherMemberIds[0]);
    if (existing) {
      return existing;
    }
  } else {
    if (otherMemberIds.length < 2) {
      throw new BadRequestError("A group conversation requires at least two other members");
    }
    if (!input.name?.trim()) {
      throw new BadRequestError("name is required for group conversations");
    }
  }

  const existingUsers = await ConversationRepository.countExistingUsers(otherMemberIds);
  if (existingUsers !== otherMemberIds.length) {
    throw new BadRequestError("One or more members do not exist");
  }

  const conversation = await ConversationRepository.createConversation({
    type: input.type,
    name: input.type === ConversationType.GROUP ? input.name!.trim() : undefined,
    imageFileId: input.type === ConversationType.GROUP ? input.imageFileId : undefined,
    createdById: currentUserId,
    memberIds: [currentUserId, ...otherMemberIds],
  });

  await ConversationRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.CREATE_CONVERSATION,
    conversationId: conversation.id,
  });

  const io = getIO();
  conversation.members.forEach((member) => {
    io.to(userRoomName(member.userId)).emit(CONVERSATION_EVENTS.CREATED, conversation);
  });

  return conversation;
}

export async function listConversations(currentUserId: string) {
  const conversations = await ConversationRepository.listForUser(currentUserId);

  return Promise.all(
    conversations.map(async (conversation) => {
      const membership = conversation.members.find((member) => member.userId === currentUserId);
      const unreadCount = await ConversationRepository.countUnread(
        conversation.id,
        currentUserId,
        membership?.lastReadAt ?? null,
      );
      return { ...conversation, unreadCount };
    }),
  );
}

export function getConversation(currentUserId: string, conversationId: string) {
  return assertMembership(conversationId, currentUserId);
}

export async function updateConversation(
  currentUserId: string,
  conversationId: string,
  input: UpdateConversationInput,
) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations can be renamed or have their image changed");
  }

  const trimmedName = input.name?.trim();
  const updated = await ConversationRepository.updateDetails(conversationId, {
    name: trimmedName,
    imageFileId: input.imageFileId,
  });

  if (trimmedName !== undefined) {
    await ConversationRepository.logAudit({
      userId: currentUserId,
      action: ChatAuditAction.CHANGE_NAME,
      conversationId,
      metadata: { from: conversation.name, to: updated.name },
    });
  }
  if (input.imageFileId !== undefined) {
    await ConversationRepository.logAudit({
      userId: currentUserId,
      action: ChatAuditAction.CHANGE_IMAGE,
      conversationId,
      metadata: { from: conversation.imageFileId, to: updated.imageFileId },
    });
  }

  getIO().to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.UPDATED, updated);
  return updated;
}

export async function addMembers(currentUserId: string, conversationId: string, userIds: string[]) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Only group conversations support adding members");
  }

  const existingMemberIds = new Set(conversation.members.map((member) => member.userId));
  const newUserIds = Array.from(new Set(userIds)).filter((id) => !existingMemberIds.has(id));
  if (newUserIds.length === 0) {
    throw new BadRequestError("No new members to add");
  }

  const existingUsers = await ConversationRepository.countExistingUsers(newUserIds);
  if (existingUsers !== newUserIds.length) {
    throw new BadRequestError("One or more members do not exist");
  }

  await ConversationRepository.addMembers(conversationId, newUserIds);
  await Promise.all(
    newUserIds.map((userId) =>
      ConversationRepository.logAudit({
        userId: currentUserId,
        action: ChatAuditAction.ADD_MEMBER,
        conversationId,
        metadata: { addedUserId: userId },
      }),
    ),
  );

  const updated = await ConversationRepository.findActiveById(conversationId);

  const io = getIO();
  io.to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.MEMBER_ADDED, {
    conversationId,
    userIds: newUserIds,
  });
  newUserIds.forEach((userId) => {
    io.to(userRoomName(userId)).emit(CONVERSATION_EVENTS.CREATED, updated);
  });

  return updated;
}

export async function removeMember(currentUserId: string, conversationId: string, targetUserId: string) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.type !== ConversationType.GROUP) {
    throw new BadRequestError("Members cannot be removed from a private conversation");
  }

  const isSelf = targetUserId === currentUserId;
  if (!isSelf && conversation.createdById !== currentUserId) {
    throw new ForbiddenError("Only the conversation creator can remove other members");
  }
  if (!conversation.members.some((member) => member.userId === targetUserId)) {
    throw new NotFoundError("That user is not a member of this conversation");
  }

  await ConversationRepository.removeMember(conversationId, targetUserId);
  await ConversationRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.REMOVE_MEMBER,
    conversationId,
    metadata: { removedUserId: targetUserId, self: isSelf },
  });

  getIO()
    .to(conversationRoomName(conversationId))
    .emit(CONVERSATION_EVENTS.MEMBER_REMOVED, { conversationId, userId: targetUserId });

  return { conversationId, userId: targetUserId };
}

export async function deleteConversation(currentUserId: string, conversationId: string) {
  const conversation = await assertMembership(conversationId, currentUserId);
  if (conversation.createdById !== currentUserId) {
    throw new ForbiddenError("Only the conversation creator can delete it");
  }

  await ConversationRepository.softDelete(conversationId);
  getIO().to(conversationRoomName(conversationId)).emit(CONVERSATION_EVENTS.DELETED, { conversationId });

  return { conversationId };
}

export async function markConversationRead(
  currentUserId: string,
  conversationId: string,
  lastReadMessageId?: string,
) {
  await assertMembership(conversationId, currentUserId);
  return ConversationRepository.markRead(conversationId, currentUserId, lastReadMessageId);
}
