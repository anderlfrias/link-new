import type { MessageType } from "@/features/messages/types/message.types";

export interface MessagePreviewFile {
  id?: string;
  mimeType?: string | null;
  originalName?: string | null;
  file?: {
    mimeType?: string | null;
    originalName?: string | null;
  } | null;
}

/** Mismo criterio que `buildLastMessagePreview` en el backend
 * (conversation.service.ts) — se necesita acá para previsualizar la cita en
 * el composer de respuesta antes de mandarla, momento en el que todavía no
 * hay una respuesta del servidor con `replyTo.preview` ya resuelto (ver
 * QuotedMessagePreview.tsx). */
export function buildMessagePreview(
  message: {
    content: string;
    deletedAt?: string | Date | null;
    // `MessageFile[]` real (`message.types.ts`) encaja estructuralmente acá
    // (su `file: StoredFile` tiene `mimeType`/`originalName` obligatorios,
    // más angosto que los opcionales de abajo) — no hace falta una unión
    // explícita con él, y esa unión rompía el tipado (ver TypeError previo:
    // acceder a `.mimeType` sobre `MessagePreviewFile | MessageFile` fallaba
    // porque `MessageFile` no lo tiene a nivel top-level, solo anidado).
    files?: MessagePreviewFile[];
    type?: MessageType | string;
  },
): string {
  if (message.deletedAt) return "Mensaje eliminado";

  if (message.type === "CONTACT") {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
        return `Contacto: ${parsed.name.trim()}`;
      }
    } catch {
      // ignore
    }
    return "Contacto";
  }

  if (message.type === "STICKER") {
    return "Sticker";
  }

  const text = message.content.trim().replace(/\s+/g, " ");

  if (message.files && message.files.length > 0) {
    const firstFile = message.files[0];
    const mimeType = (firstFile.file?.mimeType ?? firstFile.mimeType ?? "").toLowerCase();
    const count = message.files.length;

    if (mimeType.startsWith("audio/")) {
      return text ? `Nota de voz: ${text}` : "Nota de voz";
    }

    if (mimeType === "image/gif") {
      return text ? `GIF: ${text}` : "GIF";
    }

    if (mimeType.startsWith("image/")) {
      return text || (count > 1 ? `${count} imágenes` : "Imagen");
    }

    if (mimeType.startsWith("video/")) {
      return text || (count > 1 ? `${count} videos` : "Video");
    }

    // Demás archivos (PDFs, docs, etc.): aparecen como archivo adjunto
    return text || "Archivo adjunto";
  }

  return text;
}

