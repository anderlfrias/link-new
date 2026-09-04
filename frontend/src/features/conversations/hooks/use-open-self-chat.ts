"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";

/** Abre "Mensajes guardados" — la crea la primera vez, después reusa siempre la misma. */
export function useOpenSelfChat() {
  const { session } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (!session) return;
    setPending(true);
    setError(null);
    try {
      const conversation = await getOrCreateSelfChat(session.token);
      router.push(`/conversations/${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron abrir los mensajes guardados.");
    } finally {
      setPending(false);
    }
  }, [session, router]);

  return { open, pending, error };
}
