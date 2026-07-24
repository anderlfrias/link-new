import { IconCheck, IconChecks } from "@tabler/icons-react";
import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";
import { cn } from "@/utils/cn";

interface MessageStatusTicksProps {
  status: MessageReceiptStatus | null;
  /** "onBrand" = se dibuja sobre el bubble azul propio (necesita otro contraste). */
  tone?: "default" | "onBrand";
}

/** Ver backend/API.md sección 7 — solo tiene valor cuando el último mensaje es propio. */
export function MessageStatusTicks({ status, tone = "default" }: MessageStatusTicksProps) {
  if (!status) return null;

  if (status === "sent") {
    return (
      <IconCheck
        size={16}
        stroke={2}
        className={tone === "onBrand" ? "text-white/70" : "text-neutral-400"}
      />
    );
  }

  const isRead = status === "read";
  return (
    <IconChecks
      size={16}
      stroke={2}
      className={cn(
        tone === "onBrand"
          ? isRead
            ? "text-white"
            : "text-white/70"
          : isRead
            ? "text-brand-blue"
            : "text-neutral-400",
      )}
    />
  );
}
