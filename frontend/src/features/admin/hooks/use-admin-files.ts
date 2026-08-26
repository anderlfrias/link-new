"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { listAdminFiles } from "@/features/admin/api/admin-files.api";
import type { AdminFileFilters, AdminFileListItem } from "@/features/admin/types/admin-files.types";

export type AdminFilesStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 30;

export function useAdminFiles(filters: AdminFileFilters) {
  const { session } = useAuth();
  const token = session?.token;

  const [files, setFiles] = useState<AdminFileListItem[]>([]);
  const [status, setStatus] = useState<AdminFilesStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  // Serializado para que cambiar cualquier filtro dispare un reset+refetch
  // desde cero, sin depender de que el caller memoice el objeto `filters`.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    setError(null);
    listAdminFiles(token, { ...filters, limit: PAGE_SIZE })
      .then((data) => {
        setFiles(data.files);
        setHasMore(data.files.length === PAGE_SIZE);
        setTotalCount(data.totalCount);
        setTotalSize(data.totalSize);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los archivos.");
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, reloadToken]);

  const loadMore = useCallback(() => {
    if (!token || loadingMore || !hasMore || files.length === 0) return;
    setLoadingMore(true);
    listAdminFiles(token, { ...filters, before: files[files.length - 1].id, limit: PAGE_SIZE })
      .then((data) => {
        setFiles((prev) => [...prev, ...data.files]);
        setHasMore(data.files.length === PAGE_SIZE);
        setTotalCount(data.totalCount);
        setTotalSize(data.totalSize);
      })
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, files, loadingMore, hasMore]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  /** Saca una fila de la lista tras un delete exitoso, sin refetch completo. */
  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setTotalCount((prev) => Math.max(0, prev - 1));
  }, []);

  return { files, status, error, hasMore, loadingMore, loadMore, totalCount, totalSize, refetch, removeFile };
}
