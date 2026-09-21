import type { Message } from "@/features/messages/types/message.types";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Formatea un mensaje individual para copiar su contenido al portapapeles.
 */
export function formatSingleMessageContent(message: Message): string {
  if (message.deletedAt) {
    return "Mensaje eliminado";
  }

  if (message.type === "CONTACT") {
    try {
      const payload = JSON.parse(message.content);
      const parts = [payload.name];
      if (payload.username) parts.push(`@${payload.username}`);
      if (payload.phone) parts.push(payload.phone);
      return `Contacto: ${parts.join(" - ")}`;
    } catch {
      return message.content || "[Contacto]";
    }
  }

  if (message.content.trim()) {
    return message.content;
  }

  if (message.files.length > 0) {
    const fileNames = message.files
      .filter((f) => !f.file.deletedAt)
      .map((f) => f.file.name)
      .join(", ");
    return fileNames ? `[Archivo: ${fileNames}]` : "[Archivo adjunto]";
  }

  return "";
}

/**
 * Formatea una lista de mensajes seleccionados para copiarlos al portapapeles.
 * - Si es 1 mensaje: devuelve el contenido directo.
 * - Si son varios mensajes: los ordena cronológicamente y los formatea con timestamp y remitente.
 */
export function formatMessagesForCopy(
  messages: Message[],
  currentUserId: string,
): string {
  if (messages.length === 0) return "";

  if (messages.length === 1) {
    return formatSingleMessageContent(messages[0]);
  }

  // Ordenar cronológicamente (más antiguo primero)
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return sorted
    .map((msg) => {
      const time = formatTime(msg.createdAt);
      const isOwn = msg.senderId === currentUserId;
      const senderName = isOwn ? "Yo" : msg.sender?.name || "Usuario";
      const content = formatSingleMessageContent(msg);
      return `[${time}] ${senderName}: ${content}`;
    })
    .join("\n");
}
