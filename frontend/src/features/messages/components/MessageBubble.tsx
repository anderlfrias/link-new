import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { aggregateMessageStatus } from "@/utils/message-status";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isOwn, showSender }: MessageBubbleProps) {
  const isDeleted = Boolean(message.deletedAt);
  const status = isOwn ? aggregateMessageStatus(message.receipts) : null;

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 shadow-sm",
          isOwn
            ? "bg-brand-blue text-white"
            : "bg-white text-brand-ink dark:bg-neutral-800 dark:text-white",
        )}
      >
        {showSender && !isOwn && (
          <p className="mb-0.5 text-xs font-semibold text-brand-teal-dark dark:text-brand-teal-light">
            {message.sender.name}
          </p>
        )}
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm",
            isDeleted && "italic text-neutral-400 dark:text-neutral-500",
            !isDeleted && !isOwn && "text-brand-ink dark:text-white",
          )}
        >
          {isDeleted ? "Mensaje eliminado" : message.content}
        </p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[11px]",
            isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
          )}
        >
          <span>{formatBubbleTime(message.createdAt)}</span>
          {message.editedAt && !isDeleted && <span>· editado</span>}
          {status && <MessageStatusTicks status={status} tone="onBrand" />}
        </div>
      </div>
    </div>
  );
}
