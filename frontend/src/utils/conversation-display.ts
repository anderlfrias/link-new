import type { Conversation, ConversationMember } from "@/features/conversations/types/conversation.types";

export function getOtherMembers(conversation: Conversation, currentUserId: string): ConversationMember[] {
  return conversation.members.filter((member) => member.userId !== currentUserId);
}

/** GROUP muestra su nombre; PRIVATE muestra el nombre del otro miembro. */
export function getConversationDisplayName(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === "GROUP") {
    return conversation.name ?? "Grupo";
  }
  const other = getOtherMembers(conversation, currentUserId)[0];
  return other?.user.name ?? "Usuario";
}
