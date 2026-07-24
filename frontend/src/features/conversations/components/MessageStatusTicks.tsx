import { IconCheck, IconChecks } from "@tabler/icons-react";
import type { MessageReceiptStatus } from "@/features/conversations/types/conversation.types";
import { cn } from "@/utils/cn";

/** Ver backend/API.md sección 7 — solo tiene valor cuando el último mensaje es propio. */
export function MessageStatusTicks({ status }: { status: MessageReceiptStatus | null }) {
  if (!status) return null;

  if (status === "sent") {
    return <IconCheck size={16} stroke={2} className="text-neutral-400" />;
  }

  return (
    <IconChecks
      size={16}
      stroke={2}
      className={cn(status === "read" ? "text-brand-blue" : "text-neutral-400")}
    />
  );
}
