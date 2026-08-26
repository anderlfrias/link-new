"use client";

import { useState, type FormEvent } from "react";
import { IconAlertCircle, IconInfoCircle, IconLoader2 } from "@tabler/icons-react";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { AdminUserRow } from "@/features/admin/components/AdminUserRow";
import type { AdminUserFilters } from "@/features/admin/types/admin-users.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function AdminUsersPanel() {
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const { users, status, error, hasMore, loadingMore, loadMore, totalCount, refetch } = useAdminUsers(filters);

  function handleApplyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters({ search: searchDraft.trim() || undefined });
  }

  function handleClearFilters() {
    setSearchDraft("");
    setFilters({});
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Usuarios</h2>

          <div className="flex items-start gap-2 rounded-lg bg-brand-blue/10 px-3 py-2 text-sm text-brand-blue dark:bg-brand-blue/20">
            <IconInfoCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              Este panel es de solo lectura. Para actualizar el nombre, la foto o cualquier otro dato de un usuario,
              hacelo desde EXTERNAL_AUTH.
            </span>
          </div>

          <form onSubmit={handleApplyFilters} className="flex gap-2">
            <Input
              placeholder="Buscar por nombre, email o usuario"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="max-w-sm"
            />
            <Button type="submit">Buscar</Button>
            <Button type="button" variant="ghost" onClick={handleClearFilters}>
              Limpiar
            </Button>
          </form>

          {status !== "error" && (status !== "loading" || users.length > 0) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{totalCount} usuario(s)</p>
          )}

          {(status === "loading" || status === "idle") && users.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <IconLoader2 className="animate-spin text-brand-blue" size={28} />
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
              <Button type="button" variant="ghost" onClick={refetch}>
                Reintentar
              </Button>
            </div>
          )}

          {status === "ready" && users.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se encontraron usuarios con estos filtros.
            </p>
          )}

          {users.length > 0 && (
            <div className="flex flex-col">
              {users.map((user) => (
                <AdminUserRow key={user.id} user={user} />
              ))}
            </div>
          )}

          {hasMore && users.length > 0 && (
            <div className="flex justify-center py-3">
              <Button type="button" variant="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <IconLoader2 className="animate-spin" size={16} />}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
