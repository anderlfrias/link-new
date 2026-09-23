"use client";

import {
  IconBan,
  IconChartBar,
  IconFileText,
  IconMicrophone,
  IconMoodSmile,
  IconPaperclip,
  IconPhone,
  IconPhoto,
  IconPlayerPlay,
  IconUser,
  IconVideo,
  type TablerIcon,
} from "@tabler/icons-react";
import { cn } from "@/utils/cn";

export interface ParsedPreview {
  Icon: TablerIcon | null;
  text: string;
  isDeleted: boolean;
}

/**
 * Parsea el preview de un mensaje para extraer el ícono adecuado
 * y limpiar el texto eliminando emojis, de modo que la UI
 * utilice íconos visuales de Tabler en vez de emojis crudos.
 */
export function parseMessagePreview(rawPreview: string | null | undefined): ParsedPreview {
  if (!rawPreview || !rawPreview.trim()) {
    return { Icon: null, text: "Sin mensajes todavía", isDeleted: false };
  }

  const trimmed = rawPreview.trim();

  // Mensaje eliminado
  if (trimmed === "Mensaje eliminado" || trimmed.startsWith("🚫") || trimmed.includes("Mensaje eliminado")) {
    return { Icon: IconBan, text: "Mensaje eliminado", isDeleted: true };
  }

  // Sticker
  if (trimmed === "Sticker" || trimmed.startsWith("🎭") || trimmed.toLowerCase().startsWith("sticker")) {
    const text = trimmed.replace(/^🎭\s*/, "") || "Sticker";
    return { Icon: IconMoodSmile, text, isDeleted: false };
  }

  // Nota de voz / Audio
  if (trimmed.startsWith("🎤 ") || trimmed.startsWith("🎤") || trimmed.toLowerCase().startsWith("nota de voz")) {
    const text = trimmed.replace(/^🎤\s*/, "") || "Nota de voz";
    return { Icon: IconMicrophone, text, isDeleted: false };
  }

  // GIF
  if (trimmed.startsWith("👾 ") || trimmed.startsWith("👾") || trimmed.toUpperCase().startsWith("GIF")) {
    const text = trimmed.replace(/^👾\s*/, "") || "GIF";
    return { Icon: IconPlayerPlay, text, isDeleted: false };
  }

  // Imagen / Foto
  if (
    trimmed === "Imagen" ||
    trimmed.toLowerCase().startsWith("imagen") ||
    trimmed.toLowerCase().includes("imágenes") ||
    trimmed.startsWith("📷 ") ||
    trimmed.startsWith("📷") ||
    trimmed.toLowerCase().startsWith("foto")
  ) {
    const text = trimmed.replace(/^📷\s*/, "") || "Imagen";
    return { Icon: IconPhoto, text, isDeleted: false };
  }

  // Video
  if (
    trimmed.startsWith("🎥 ") ||
    trimmed.startsWith("🎥") ||
    trimmed.toLowerCase().startsWith("video") ||
    trimmed.toLowerCase().includes("videos")
  ) {
    const text = trimmed.replace(/^🎥\s*/, "") || "Video";
    return { Icon: IconVideo, text, isDeleted: false };
  }

  // Documento específico con ícono de documento
  if (trimmed.startsWith("📄 ") || trimmed.startsWith("📄") || trimmed.toLowerCase().startsWith("documento")) {
    const text = trimmed.replace(/^📄\s*/, "") || "Documento";
    return { Icon: IconFileText, text, isDeleted: false };
  }

  // Contacto
  if (trimmed.startsWith("👤 ") || trimmed.startsWith("👤") || trimmed.toLowerCase().startsWith("contacto")) {
    const text = trimmed.replace(/^👤\s*/, "") || "Contacto";
    return { Icon: IconUser, text, isDeleted: false };
  }

  // Encuesta
  if (
    trimmed.startsWith("📊 ") ||
    trimmed.startsWith("📊") ||
    trimmed.toLowerCase().startsWith("encuesta")
  ) {
    const text = trimmed.replace(/^📊\s*/, "") || "Encuesta";
    return { Icon: IconChartBar, text, isDeleted: false };
  }

  // Videollamada
  if (
    trimmed.startsWith("📹 ") ||
    trimmed.startsWith("📹") ||
    trimmed.toLowerCase().startsWith("videollamada")
  ) {
    const text =
      trimmed
        .replace(/^📹\s*/u, "")
        .replace(/\uFFFD/g, "")
        .replace(/^[\uD800-\uDFFF]\s*/, "")
        .trim() || "Videollamada";
    return { Icon: IconVideo, text, isDeleted: false };
  }

  // Llamada de voz
  if (
    trimmed.startsWith("📞 ") ||
    trimmed.startsWith("📞") ||
    trimmed.toLowerCase().startsWith("llamada")
  ) {
    const text =
      trimmed
        .replace(/^📞\s*/u, "")
        .replace(/\uFFFD/g, "")
        .replace(/^[\uD800-\uDFFF]\s*/, "")
        .trim() || "Llamada";
    return { Icon: IconPhone, text, isDeleted: false };
  }

  // Archivo adjunto (genérico o demás archivos)
  if (
    trimmed.startsWith("📎 ") ||
    trimmed.startsWith("📎") ||
    trimmed.toLowerCase().startsWith("archivo adjunto") ||
    trimmed.toLowerCase().includes("archivos adjuntos")
  ) {
    const text = trimmed.replace(/^📎\s*/, "") || "Archivo adjunto";
    return { Icon: IconPaperclip, text, isDeleted: false };
  }

  return { Icon: null, text: trimmed, isDeleted: false };
}

interface MessagePreviewLabelProps {
  senderPrefix?: string | null;
  preview: string | null | undefined;
  className?: string;
  iconClassName?: string;
}

export function MessagePreviewLabel({
  senderPrefix,
  preview,
  className,
  iconClassName,
}: MessagePreviewLabelProps) {
  const { Icon, text, isDeleted } = parseMessagePreview(preview);

  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center truncate text-sm text-neutral-500 dark:text-neutral-400", className)}>
      {senderPrefix && <span className="shrink-0 mr-1">{senderPrefix}</span>}
      {Icon && (
        <Icon
          size={15}
          stroke={1.75}
          aria-hidden="true"
          className={cn(
            "mr-1 inline-block shrink-0 -mt-0.5",
            isDeleted ? "text-neutral-400" : "text-neutral-500 dark:text-neutral-400",
            iconClassName,
          )}
        />
      )}
      <span className={cn("truncate", isDeleted && "italic text-neutral-400")}>{text}</span>
    </span>
  );
}
