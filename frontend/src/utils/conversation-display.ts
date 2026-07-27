import type {
  Conversation,
  ConversationMember,
  ConversationListItem,
} from "@/features/conversations/types/conversation.types";

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

/**
 * Línea secundaria de la lista de conversaciones, estilo WhatsApp/Telegram:
 * el texto del último mensaje, prefijado con quién lo mandó cuando hace
 * falta aclararlo ("Tú: " si lo mandé yo, "Nombre: " en grupos ajenos).
 */
export function getLastMessagePreviewText(
  conversation: ConversationListItem,
  currentUserId: string,
): string {
  if (!conversation.lastMessagePreview) return "Sin mensajes todavía";

  if (conversation.lastMessageSenderId === currentUserId) {
    return `Tú: ${conversation.lastMessagePreview}`;
  }

  if (conversation.type === "GROUP") {
    const sender = conversation.members.find((member) => member.userId === conversation.lastMessageSenderId);
    if (sender) return `${sender.user.name}: ${conversation.lastMessagePreview}`;
  }

  return conversation.lastMessagePreview;
}
