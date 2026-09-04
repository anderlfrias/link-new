import type { Message } from "@/features/messages/types/message.types";

/** Mismo criterio que `buildLastMessagePreview` en el backend
 * (conversation.service.ts) — se necesita acá para previsualizar la cita en
 * el composer de respuesta antes de mandarla, momento en el que todavía no
 * hay una respuesta del servidor con `replyTo.preview` ya resuelto (ver
 * QuotedMessagePreview.tsx). */
export function buildMessagePreview(message: Pick<Message, "content" | "deletedAt" | "files">): string {
  if (message.deletedAt) return "Mensaje eliminado";
  const text = message.content.trim();
  if (text) return text;
  return message.files.length > 0 ? "📎 Archivo adjunto" : "";
}
