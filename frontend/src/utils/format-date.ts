import type { Locale } from "@/i18n/types";

/** Timestamps estilo WhatsApp para la lista de conversaciones. */
export function formatConversationTimestamp(iso: string, locale: Locale = "es"): string {
  const date = new Date(iso);
  const now = new Date();
  const intlLocale = locale === "en" ? "en-US" : "es-AR";

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return locale === "en" ? "Yesterday" : "Ayer";
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays >= 0 && diffDays < 7) {
    const weekday = date.toLocaleDateString(intlLocale, { weekday: "long" });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  return date.toLocaleDateString(intlLocale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Separador de fecha dentro del hilo de mensajes ("Hoy", "Ayer", fecha completa). */
export function formatDateSeparator(iso: string, locale: Locale = "es"): string {
  const date = new Date(iso);
  const now = new Date();
  const intlLocale = locale === "en" ? "en-US" : "es-AR";

  if (date.toDateString() === now.toDateString()) return locale === "en" ? "Today" : "Hoy";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return locale === "en" ? "Yesterday" : "Ayer";

  return date.toLocaleDateString(intlLocale, { day: "numeric", month: "long", year: "numeric" });
}
