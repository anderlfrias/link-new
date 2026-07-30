"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { createConversation } from "@/features/conversations/api/conversations.api";
import { uploadFile } from "@/features/files/api/files.api";

export function useCreateGroup() {
  const { session } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGroup = useCallback(
    async (memberIds: string[], name: string, imageFile: File | null) => {
      if (!session) return null;
      setPending(true);
      setError(null);
      try {
        const imageFileId = imageFile ? (await uploadFile(session.token, imageFile)).id : undefined;
        const conversation = await createConversation(session.token, {
          type: "GROUP",
          memberIds,
          name,
          imageFileId,
        });
        router.push(`/conversations/${conversation.id}`);
        return conversation;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el grupo.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [session, router],
  );

  return { createGroup, pending, error };
}
