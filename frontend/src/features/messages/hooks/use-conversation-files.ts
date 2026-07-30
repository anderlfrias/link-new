"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { listConversationFiles } from "@/features/messages/api/messages.api";
import type { ConversationFile } from "@/features/messages/types/message.types";

export type ConversationFilesStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 50;

/** Archivos compartidos en la conversación, para el panel de detalle (ver
 * backend/API.md sección 6.4) — misma paginación por cursor que useMessages. */
export function useConversationFiles(conversationId: string) {
  const { session } = useAuth();
  const token = session?.token;

  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [status, setStatus] = useState<ConversationFilesStatus>("idle");
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    listConversationFiles(token, conversationId, { limit: PAGE_SIZE })
      .then((data) => {
        setFiles(data);
        setHasMore(data.length === PAGE_SIZE);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token, conversationId]);

  const loadMore = useCallback(() => {
    if (!token || loadingMore || !hasMore || files.length === 0) return;
    setLoadingMore(true);
    listConversationFiles(token, conversationId, { before: files[files.length - 1].id, limit: PAGE_SIZE })
      .then((older) => {
        setFiles((prev) => [...prev, ...older]);
        setHasMore(older.length === PAGE_SIZE);
      })
      .finally(() => setLoadingMore(false));
  }, [token, conversationId, files, loadingMore, hasMore]);

  return { files, status, hasMore, loadingMore, loadMore };
}
