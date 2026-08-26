"use client";

import { useState, type FormEvent } from "react";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { useAdminFiles } from "@/features/admin/hooks/use-admin-files";
import { useDeleteAdminFile } from "@/features/admin/hooks/use-delete-admin-file";
import { AdminFileRow } from "@/features/admin/components/AdminFileRow";
import { DeleteFileConfirmModal } from "@/features/admin/components/DeleteFileConfirmModal";
import type { AdminFileFilters, AdminFileListItem, AdminFileType } from "@/features/admin/types/admin-files.types";
import { formatFileSize } from "@/utils/file-format";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface FilterDraft {
  type: AdminFileType | "";
  uploader: string;
  search: string;
  from: string;
  to: string;
}

const EMPTY_DRAFT: FilterDraft = { type: "", uploader: "", search: "", from: "", to: "" };

function draftToFilters(draft: FilterDraft): AdminFileFilters {
  return {
    type: draft.type || undefined,
    uploader: draft.uploader.trim() || undefined,
    search: draft.search.trim() || undefined,
    from: draft.from ? new Date(draft.from).toISOString() : undefined,
    to: draft.to ? new Date(draft.to).toISOString() : undefined,
  };
}

export function AdminFilesPanel() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [filters, setFilters] = useState<AdminFileFilters>({});
  const { files, status, error, hasMore, loadingMore, loadMore, totalCount, totalSize, refetch, removeFile } =
    useAdminFiles(filters);
  const { remove, pending: deletePending, error: deleteError } = useDeleteAdminFile();
  const [fileToDelete, setFileToDelete] = useState<AdminFileListItem | null>(null);

  function handleApplyFilters(event: FormEvent) {
    event.preventDefault();
    setFilters(draftToFilters(draft));
  }

  function handleClearFilters() {
    setDraft(EMPTY_DRAFT);
    setFilters({});
  }

  async function handleConfirmDelete() {
    if (!fileToDelete) return;
    const ok = await remove(fileToDelete.id);
    if (ok) {
      removeFile(fileToDelete.id);
      setFileToDelete(null);
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Archivos</h2>

          <form onSubmit={handleApplyFilters} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Select
              value={draft.type}
              onChange={(event) => setDraft((d) => ({ ...d, type: event.target.value as AdminFileType | "" }))}
            >
              <option value="">Todos los tipos</option>
              <option value="image">Imágenes</option>
              <option value="audio">Audio</option>
              <option value="other">Otros</option>
            </Select>
            <Input
              placeholder="Nombre de archivo"
              value={draft.search}
              onChange={(event) => setDraft((d) => ({ ...d, search: event.target.value }))}
            />
            <Input
              placeholder="Usuario (nombre o email)"
              value={draft.uploader}
              onChange={(event) => setDraft((d) => ({ ...d, uploader: event.target.value }))}
            />
            <Input
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
            />
            <Input type="date" value={draft.to} onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))} />
            <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-5">
              <Button type="submit">Filtrar</Button>
              <Button type="button" variant="ghost" onClick={handleClearFilters}>
                Limpiar
              </Button>
            </div>
          </form>

          {status !== "error" && (status !== "loading" || files.length > 0) && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {totalCount} archivo(s) · {formatFileSize(totalSize)} en total
            </p>
          )}

          {(status === "loading" || status === "idle") && files.length === 0 && (
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

          {status === "ready" && files.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No se encontraron archivos con estos filtros.
            </p>
          )}

          {files.length > 0 && (
            <div className="flex flex-col">
              {files.map((file) => (
                <AdminFileRow key={file.id} file={file} onDelete={setFileToDelete} />
              ))}
            </div>
          )}

          {hasMore && files.length > 0 && (
            <div className="flex justify-center py-3">
              <Button type="button" variant="ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <IconLoader2 className="animate-spin" size={16} />}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      </div>

      {fileToDelete && (
        <DeleteFileConfirmModal
          file={fileToDelete}
          pending={deletePending}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => setFileToDelete(null)}
        />
      )}
    </div>
  );
}
