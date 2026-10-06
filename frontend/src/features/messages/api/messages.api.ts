import { apiRequest } from "@/lib/api-client";
import type {
  ConversationFile,
  EditMessageInput,
  ListConversationFilesQuery,
  ListMessagesQuery,
  Message,
  MessageReaction,
  Poll,
  SendMessageInput,
} from "@/features/messages/types/message.types";

const basePath = (conversationId: string) => `/v1/conversations/${conversationId}/messages`;

export function listMessages(
  token: string,
  conversationId: string,
  query: ListMessagesQuery = {},
): Promise<Message[]> {
  return apiRequest<Message[]>(basePath(conversationId), {
    token,
    query: { before: query.before, limit: query.limit, query: query.query },
  });
}

export function listConversationFiles(
  token: string,
  conversationId: string,
  query: ListConversationFilesQuery = {},
): Promise<ConversationFile[]> {
  return apiRequest<ConversationFile[]>(`${basePath(conversationId)}/files`, {
    token,
    query: { before: query.before, limit: query.limit },
  });
}

export function sendMessage(
  token: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<Message> {
  return apiRequest<Message>(basePath(conversationId), { method: "POST", token, body: input });
}

/** Reenvía `messageId` (de cualquier conversación donde seas miembro) a `conversationId`. */
export function forwardMessage(
  token: string,
  conversationId: string,
  messageId: string,
): Promise<Message> {
  return apiRequest<Message>(`${basePath(conversationId)}/forward`, {
    method: "POST",
    token,
    body: { messageId },
  });
}

export function editMessage(
  token: string,
  conversationId: string,
  messageId: string,
  input: EditMessageInput,
): Promise<Message> {
  return apiRequest<Message>(`${basePath(conversationId)}/${messageId}`, {
    method: "PATCH",
    token,
    body: input,
  });
}

export function deleteMessage(
  token: string,
  conversationId: string,
  messageId: string,
): Promise<{ conversationId: string; messageId: string; deletedAt: string }> {
  return apiRequest(`${basePath(conversationId)}/${messageId}`, { method: "DELETE", token });
}

export function toggleReaction(
  token: string,
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<{
  conversationId: string;
  messageId: string;
  reactions: MessageReaction[];
  userId: string;
  emoji: string;
  /// "updated": el usuario ya tenía otra reacción y la cambió por este emoji
  /// (una sola reacción por usuario, ver message.service.ts#toggleReaction).
  action: "added" | "removed" | "updated";
}> {
  return apiRequest(`${basePath(conversationId)}/${messageId}/reactions`, {
    method: "POST",
    token,
    body: { emoji },
  });
}

export function votePoll(
  token: string,
  conversationId: string,
  messageId: string,
  optionId: string,
): Promise<{
  conversationId: string;
  messageId: string;
  poll: Poll;
  userId: string;
  optionId: string;
  action: "added" | "removed";
}> {
  return apiRequest(`${basePath(conversationId)}/${messageId}/poll/vote`, {
    method: "POST",
    token,
    body: { optionId },
  });
}

