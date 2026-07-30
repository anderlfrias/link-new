"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { createConversation } from "@/features/conversations/api/conversations.api";

export function useStartConversation() {
  const { session } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWithUser = useCallback(
    async (userId: string) => {
      if (!session) return null;
      setPending(true);
      setError(null);
      try {
        const conversation = await createConversation(session.token, {
          type: "PRIVATE",
          memberIds: [userId],
        });
        router.push(`/conversations/${conversation.id}`);
        return conversation;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo iniciar la conversación.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [session, router],
  );

  return { startWithUser, pending, error };
}
