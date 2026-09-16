"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { listAdminAuditLogs } from "@/features/admin/api/admin-audit.api";
import type {
  AdminAuditLogFilters,
  AdminAuditLogListItem,
} from "@/features/admin/types/admin-audit.types";

export type AdminAuditLogsStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 50;

export function useAdminAuditLogs(filters: AdminAuditLogFilters) {
  const { session } = useAuth();
  const token = session?.token;

  const [items, setItems] = useState<AdminAuditLogListItem[]>([]);
  const [status, setStatus] = useState<AdminAuditLogsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    setError(null);

    listAdminAuditLogs(token, { ...filters, limit: PAGE_SIZE })
      .then((data) => {
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los registros de auditoría.");
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, reloadToken]);

  const loadMore = useCallback(() => {
    if (!token || loadingMore || !hasMore || !nextCursor) return;
    setLoadingMore(true);

    listAdminAuditLogs(token, { ...filters, before: nextCursor, limit: PAGE_SIZE })
      .then((data) => {
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al cargar más registros.");
      })
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, nextCursor, loadingMore, hasMore]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { items, status, error, hasMore, loadingMore, loadMore, refetch };
}
