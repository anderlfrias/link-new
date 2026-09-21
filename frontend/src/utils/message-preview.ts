import type { Message } from "@/features/messages/types/message.types";

/** Mismo criterio que `buildLastMessagePreview` en el backend
 * (conversation.service.ts) — se necesita acá para previsualizar la cita en
 * el composer de respuesta antes de mandarla, momento en el que todavía no
 * hay una respuesta del servidor con `replyTo.preview` ya resuelto (ver
 * QuotedMessagePreview.tsx). */
export function buildMessagePreview(
  message: Pick<Message, "content" | "deletedAt" | "files"> & { type?: Message["type"] },
): string {
  if (message.deletedAt) return "Mensaje eliminado";

  if (message.type === "CONTACT") {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
        return `👤 Contacto: ${parsed.name.trim()}`;
      }
    } catch {
      // ignore
    }
    return "👤 Contacto";
  }

  const text = message.content.trim();
  if (text) return text;
  return message.files.length > 0 ? "📎 Archivo adjunto" : "";
}
