"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getConversation } from "@/features/conversations/api/conversations.api";
import type { Conversation } from "@/features/conversations/types/conversation.types";

export type ConversationDetailStatus = "idle" | "loading" | "ready" | "error";

export function useConversation(conversationId: string) {
  const { session } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [status, setStatus] = useState<ConversationDetailStatus>("idle");

  useEffect(() => {
    if (!session) return;
    setStatus("loading");
    getConversation(session.token, conversationId)
      .then((data) => {
        setConversation(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [session, conversationId]);

  return { conversation, status };
}
