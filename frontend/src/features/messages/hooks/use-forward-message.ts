"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { forwardMessage } from "@/features/messages/api/messages.api";
import { createConversation, getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";

/** Destino de un reenvío: una conversación existente, "self" (resuelve/crea
 * "Mensajes guardados"), o un contacto sin chat todavía (crea — o reusa, si
 * ya existía — la conversación PRIVATE con esa persona) — ver ForwardMessageModal. */
export type ForwardTarget = { conversationId: string } | { userId: string } | "self";

async function resolveConversationId(target: ForwardTarget, token: string): Promise<string> {
  if (target === "self") return (await getOrCreateSelfChat(token)).id;
  if ("userId" in target) {
    return (await createConversation(token, { type: "PRIVATE", memberIds: [target.userId] })).id;
  }
  return target.conversationId;
}

export function useForwardMessage() {
  const { session } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Reenvía a uno o varios destinos a la vez (grupos, personas y/o "Mensajes
   * guardados"), como WhatsApp/Telegram — se resuelve/crea cada conversación
   * de destino y se reenvía en paralelo. No navega a ningún chat en particular
   * (con varios destinos no habría uno solo al cual ir). Devuelve cuántos
   * destinos tuvieron éxito; si alguno falla, `error` describe el conteo sin
   * abortar los que sí funcionaron. */
  const forward = useCallback(
    async (messageId: string, targets: ForwardTarget[]) => {
      if (!session || targets.length === 0) return 0;
      setPending(true);
      setError(null);
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const conversationId = await resolveConversationId(target, session.token);
          await forwardMessage(session.token, conversationId, messageId);
        }),
      );
      setPending(false);
      const failed = results.filter((result) => result.status === "rejected").length;
      const succeeded = targets.length - failed;
      if (failed > 0) {
        setError(
          succeeded > 0
            ? `Se reenvió a ${succeeded} de ${targets.length} chats. ${failed} no se pudieron enviar.`
            : "No se pudo reenviar el mensaje.",
        );
      }
      return succeeded;
    },
    [session],
  );

  return { forward, pending, error };
}
