import type {
  MessageReceipt,
  MessageReceiptStatus,
} from "@/features/conversations/types/conversation.types";

/**
 * Mismo criterio que usa el backend para `lastMessageStatus`: "read" (✓✓ azul) solo
 * cuando TODOS los destinatarios lo leyeron. Ver backend/API.md sección 7.
 */
export function aggregateMessageStatus(receipts: MessageReceipt[]): MessageReceiptStatus {
  if (receipts.length === 0) return "sent";
  if (receipts.every((receipt) => receipt.status === "read")) return "read";
  if (receipts.every((receipt) => receipt.status === "delivered" || receipt.status === "read")) {
    return "delivered";
  }
  return "sent";
}
