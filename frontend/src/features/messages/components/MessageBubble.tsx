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
  const isEdited = Boolean(message.editedAt && !isDeleted);

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] min-w-[80px] rounded-2xl px-3 py-2 shadow-sm",
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
            "flow-root whitespace-pre-wrap break-words text-sm",
            isDeleted && "italic text-neutral-400 dark:text-neutral-500",
            !isDeleted && !isOwn && "text-brand-ink dark:text-white",
          )}
        >
          {isDeleted ? "Mensaje eliminado" : message.content}
          
          <span
            className={cn(
              "float-right ml-2 mt-[3px] flex items-center gap-1 text-[11px] select-none",
              isOwn ? "text-white/70" : "text-neutral-400 dark:text-neutral-500",
            )}
          >
            <span>{formatBubbleTime(message.createdAt)}</span>
            {isEdited && <span>· editado</span>}
            {status && <MessageStatusTicks status={status} tone="onBrand" />}
          </span>
        </p>
      </div>
    </div>
  );
}
