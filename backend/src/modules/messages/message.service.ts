import { ChatAuditAction, MessageType } from "@prisma/client";
import { assertMembership, computeReceipts, markDelivered } from "../conversations/conversation.service";
import { MessageReceipt } from "../conversations/conversation.types";
import { getIO } from "../../socket";
import { conversationRoomName, getConnectedUserIds } from "../../socket/rooms";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as MessageRepository from "./message.repository";
import { MESSAGE_EVENTS } from "./message.socket";
import {
  CreateMessageInput,
  ListMessagesOptions,
  MessageWithReceipts,
  MessageWithRelations,
  UpdateMessageInput,
} from "./message.types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

async function assertOwnedMessage(conversationId: string, messageId: string): Promise<MessageWithRelations> {
  const message = await MessageRepository.findById(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw new NotFoundError("Message not found");
  }
  return message;
}

export async function sendMessage(
  currentUserId: string,
  conversationId: string,
  input: CreateMessageInput,
): Promise<MessageWithReceipts> {
  const conversation = await assertMembership(conversationId, currentUserId);

  const fileIds = Array.from(new Set(input.fileIds ?? []));
  if (fileIds.length > 0) {
    const existingFiles = await MessageRepository.countExistingFiles(fileIds);
    if (existingFiles !== fileIds.length) {
      throw new BadRequestError("One or more files do not exist");
    }
  }

  const message = await MessageRepository.createMessage({
    conversationId,
    senderId: currentUserId,
    content: input.content.trim(),
    fileIds,
  });

  await MessageRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.SEND_MESSAGE,
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
    Array.from(deliveredNow).map((userId) => markDelivered(conversationId, userId, message.id, message.createdAt)),
  );

  const receipts: MessageReceipt[] = conversation.members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => ({
      userId: member.userId,
      status: deliveredNow.has(member.userId) ? "delivered" : "sent",
    }));

  const messageWithReceipts: MessageWithReceipts = { ...message, receipts };
  io.to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.CREATED, messageWithReceipts);
  return messageWithReceipts;
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
    await markDelivered(conversationId, currentUserId, newest.id, newest.createdAt);
  }

  return ordered.map((message) => ({
    ...message,
    receipts: computeReceipts(conversation.members, message),
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

  const updated = await MessageRepository.updateContent(messageId, input.content.trim());
  await MessageRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.EDIT_MESSAGE,
    conversationId,
    messageId,
  });

  const messageWithReceipts: MessageWithReceipts = {
    ...updated,
    receipts: computeReceipts(conversation.members, updated),
  };

  getIO().to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.UPDATED, messageWithReceipts);
  return messageWithReceipts;
}

export async function deleteMessage(currentUserId: string, conversationId: string, messageId: string) {
  const conversation = await assertMembership(conversationId, currentUserId);
  const message = await assertOwnedMessage(conversationId, messageId);

  const isOwnMessage = message.senderId === currentUserId;
  if (!isOwnMessage && conversation.createdById !== currentUserId) {
    throw new ForbiddenError("Only the message author or the conversation creator can delete this message");
  }

  await MessageRepository.softDelete(messageId, currentUserId);
  await MessageRepository.logAudit({
    userId: currentUserId,
    action: ChatAuditAction.DELETE_MESSAGE,
    conversationId,
    messageId,
    metadata: { deletedOwnMessage: isOwnMessage },
  });

  getIO().to(conversationRoomName(conversationId)).emit(MESSAGE_EVENTS.DELETED, { conversationId, messageId });
  return { conversationId, messageId };
}
