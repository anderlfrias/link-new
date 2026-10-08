import type { Message } from "@/features/messages/types/message.types";

/** Un mensaje se puede reenviar si no está borrado y no es de un tipo que el
 * backend rechaza (`message_not_forwardable`): un registro de llamada solo lo
 * crea el servidor, y una encuesta reenviada quedaría sin sus opciones. */
export function isMessageForwardable(message: Pick<Message, "type" | "deletedAt">): boolean {
  if (message.deletedAt) return false;
  return message.type !== "CALL" && message.type !== "POLL" && message.type !== "SYSTEM";
}
