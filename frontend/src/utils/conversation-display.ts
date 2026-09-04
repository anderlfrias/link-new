import type {
  Conversation,
  ConversationMember,
  ConversationListItem,
} from "@/features/conversations/types/conversation.types";
import { buildStoredFileUrl } from "@/utils/file-url";

export function getOtherMembers(conversation: Conversation, currentUserId: string): ConversationMember[] {
  return conversation.members.filter((member) => member.userId !== currentUserId);
}

/** GROUP muestra su nombre; SELF un nombre fijo; PRIVATE el nombre del otro miembro. */
export function getConversationDisplayName(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === "GROUP") {
    return conversation.name ?? "Grupo";
  }
  if (conversation.type === "SELF") {
    return "Mensajes guardados";
  }
  const other = getOtherMembers(conversation, currentUserId)[0];
  return other?.user.name ?? "Usuario";
}

/** GROUP: foto del grupo si se subió una (si no, cae a iniciales). SELF: sin
 * foto — cae al ícono de marcador que arma el propio `<Avatar icon={...}>`
 * (ver ConversationListItem/ConversationDetailPanel/ConversationHeader), no
 * a las iniciales de "Mensajes guardados". PRIVATE: foto del otro miembro. */
export function getConversationAvatarUrl(conversation: Conversation, currentUserId: string): string | null {
  if (conversation.type === "GROUP") {
    return conversation.imageFile ? buildStoredFileUrl(conversation.imageFile.path) : null;
  }
  if (conversation.type === "SELF") {
    return null;
  }
  const other = getOtherMembers(conversation, currentUserId)[0];
  return other?.user.avatarFile ? buildStoredFileUrl(other.user.avatarFile.path) : null;
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
