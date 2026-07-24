import { apiRequest } from "@/lib/api-client";
import type {
  Conversation,
  ConversationListItem,
  CreateConversationInput,
  UpdateConversationInput,
} from "@/features/conversations/types/conversation.types";

const BASE_PATH = "/v1/conversations";

export function listConversations(token: string): Promise<ConversationListItem[]> {
  return apiRequest<ConversationListItem[]>(BASE_PATH, { token });
}

export function getConversation(token: string, conversationId: string): Promise<Conversation> {
  return apiRequest<Conversation>(`${BASE_PATH}/${conversationId}`, { token });
}

export function createConversation(
  token: string,
  input: CreateConversationInput,
): Promise<Conversation> {
  return apiRequest<Conversation>(BASE_PATH, { method: "POST", token, body: input });
}

export function updateConversation(
  token: string,
  conversationId: string,
  input: UpdateConversationInput,
): Promise<Conversation> {
  return apiRequest<Conversation>(`${BASE_PATH}/${conversationId}`, {
    method: "PATCH",
    token,
    body: input,
  });
}

export function addMembers(
  token: string,
  conversationId: string,
  userIds: string[],
): Promise<Conversation> {
  return apiRequest<Conversation>(`${BASE_PATH}/${conversationId}/members`, {
    method: "POST",
    token,
    body: { userIds },
  });
}

export function removeMember(
  token: string,
  conversationId: string,
  userId: string,
): Promise<{ conversationId: string; userId: string }> {
  return apiRequest(`${BASE_PATH}/${conversationId}/members/${userId}`, {
    method: "DELETE",
    token,
  });
}

export function deleteConversation(
  token: string,
  conversationId: string,
): Promise<{ conversationId: string }> {
  return apiRequest(`${BASE_PATH}/${conversationId}`, { method: "DELETE", token });
}

export function markConversationRead(
  token: string,
  conversationId: string,
  lastReadMessageId?: string,
): Promise<void> {
  return apiRequest(`${BASE_PATH}/${conversationId}/read`, {
    method: "POST",
    token,
    body: lastReadMessageId ? { lastReadMessageId } : {},
  });
}
