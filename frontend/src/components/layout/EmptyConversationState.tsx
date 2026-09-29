"use client";

import { useTranslation } from "@/i18n";

/** Mismo patrón de fondo que el hilo de mensajes (ver globals.css / MessageList.tsx),
 * pero atenuado: acá es la pantalla vacía "elegí una conversación", no un chat real,
 * así que el motivo debe notarse apenas — un detalle, no protagonismo. */
const emptyStateBackgroundStyle = {
  backgroundImage: "var(--chat-pattern-image)",
  backgroundColor: "var(--chat-pattern-bg)",
  backgroundRepeat: "repeat",
  opacity: 0.5,
} as const;

export function EmptyConversationState() {
  const { t } = useTranslation();

  return (
    <div className="relative flex h-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
      <div aria-hidden="true" className="absolute inset-0" style={emptyStateBackgroundStyle} />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectorial, no pasa por el optimizador de next/image */}
      <img
        src="/brand/logo-lockup-vertical.svg"
        alt="Link"
        className="relative h-52 w-auto opacity-90 dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem, variante para fondo oscuro */}
      <img
        src="/brand/logo-lockup-vertical-dark.svg"
        alt=""
        aria-hidden="true"
        className="relative hidden h-52 w-auto opacity-90 dark:block"
      />
      <p className="relative max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        {t("chat.emptySelectPrompt")}
      </p>
    </div>
  );
}
