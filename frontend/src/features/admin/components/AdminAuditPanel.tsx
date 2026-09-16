"use client";

import { useState, type FormEvent } from "react";
import { IconAlertCircle, IconInfoCircle, IconLoader2 } from "@tabler/icons-react";
import { useAdminAuditLogs } from "@/features/admin/hooks/use-admin-audit-logs";
import { AdminAuditRow } from "@/features/admin/components/AdminAuditRow";
import { ALL_AUDIT_ACTION_OPTIONS } from "@/features/admin/constants/audit-action-labels.constant";
import type { AdminAuditLogFilters } from "@/features/admin/types/admin-audit.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface FilterDraft {
  action: string;
  userId: string;
  from: string;
  to: string;
}

const EMPTY_DRAFT: FilterDraft = {
  action: "",
  userId: "",
  from: "",
  to: "",
};

function draftToFilters(draft: FilterDraft): AdminAuditLogFilters {
  let action: string | string[] | undefined = undefined;
  if (draft.action === "ALL") {
    // Para pedir explícitamente todas las acciones disponibles
    action = ALL_AUDIT_ACTION_OPTIONS.map((opt) => opt.value);
  } else if (draft.action) {
    action = draft.action;
  }

  return {
    action,
    userId: draft.userId.trim() || undefined,
    from: draft.from ? new Date(draft.from).toISOString() : undefined,
    to: draft.to ? new Date(draft.to).toISOString() : undefined,
  };
}

export function AdminAuditPanel() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [filters, setFilters] = useState<AdminAuditLogFilters>({});

  const { items, status, error, hasMore, loadingMore, loadMore, refetch } =
    useAdminAuditLogs(filters);

  const isDefaultActionFilter = !filters.action;

  function handleApplyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters(draftToFilters(draft));
  }

  function handleClearFilters() {
    setDraft(EMPTY_DRAFT);
    setFilters({});
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
              Registro de Auditoría
            </h2>
          </div>

          {isDefaultActionFilter && (
            <div
              className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-50/70 p-3.5 text-xs text-blue-800 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-300"
              data-testid="default-filter-notice"
            >
              <IconInfoCircle size={16} className="shrink-0" />
              <span>
                <strong>Filtro por omisión activo:</strong> mostrando solo acciones de administración y autenticación (Login, Configuración, Borrado de archivos). Las acciones de chat requieren selección explícita.
              </span>
            </div>
          )}

          <form onSubmit={handleApplyFilters} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            >
              <option value="">Filtro por defecto (Admin y autenticación)</option>
              <option value="ALL">Todas las acciones</option>
              {ALL_AUDIT_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>

            <Input
              placeholder="ID de usuario o actor"
              value={draft.userId}
              onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
            />

            <Input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />

            <Input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />

            <div className="col-span-1 flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">Filtrar</Button>
              <Button type="button" variant="ghost" onClick={handleClearFilters}>
                Limpiar
              </Button>
            </div>
          </form>

          {(status === "loading" || status === "idle") && items.length === 0 && (
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

          {status === "ready" && items.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se encontraron eventos de auditoría con estos filtros.
            </p>
          )}

          {items.length > 0 && (
            <div className="flex flex-col rounded-xl border border-black/5 bg-white dark:border-white/10 dark:bg-neutral-900/50">
              {items.map((item) => (
                <AdminAuditRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {hasMore && items.length > 0 && (
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
