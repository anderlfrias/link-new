"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { listAdminUsers } from "@/features/admin/api/admin-users.api";
import type { AdminUserFilters, AdminUserListItem } from "@/features/admin/types/admin-users.types";

export type AdminUsersStatus = "idle" | "loading" | "ready" | "error";

const PAGE_SIZE = 30;

export function useAdminUsers(filters: AdminUserFilters) {
  const { session } = useAuth();
  const token = session?.token;

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [status, setStatus] = useState<AdminUsersStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  // Serializado para que cambiar cualquier filtro dispare un reset+refetch
  // desde cero, sin depender de que el caller memoice el objeto `filters`.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (!token) return;
    setStatus("loading");
    setError(null);
    listAdminUsers(token, { ...filters, limit: PAGE_SIZE })
      .then((data) => {
        setUsers(data.users);
        setHasMore(data.users.length === PAGE_SIZE);
        setTotalCount(data.totalCount);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.");
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, reloadToken]);

  const loadMore = useCallback(() => {
    if (!token || loadingMore || !hasMore || users.length === 0) return;
    setLoadingMore(true);
    listAdminUsers(token, { ...filters, before: users[users.length - 1].id, limit: PAGE_SIZE })
      .then((data) => {
        setUsers((prev) => [...prev, ...data.users]);
        setHasMore(data.users.length === PAGE_SIZE);
        setTotalCount(data.totalCount);
      })
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filtersKey, users, loadingMore, hasMore]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { users, status, error, hasMore, loadingMore, loadMore, totalCount, refetch };
}
