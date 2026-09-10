/** Ver backend/API.md, sección 9 (Adjuntos). */

export type FileProvider = "LOCAL";

/** Forma devuelta por POST/GET/DELETE /api/v1/files. */
export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  /** Relativa al host del backend, ej. "/api/v1/files/:id/content?t=...". */
  url: string;
  createdAt: string;
}

/** Forma pública de `files[].file` embebida dentro de un mensaje (ver message.types.ts) — LARGE_FILES_PLAN.md Fase 2 (§5.2, S12). */
export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  createdAt: string;
  deletedAt: string | null;
  /** @deprecated Ruta interna eliminada en Fase 2 (S12). Conservada opcional para compatibilidad transitoria. */
  path?: string;
  /** @deprecated Proveedor interno eliminado en Fase 2 (S12). */
  provider?: FileProvider;
  /** @deprecated Checksum interno eliminado en Fase 2 (S12). */
  checksum?: string | null;
  /** @deprecated Creador eliminado en Fase 2 (S12). */
  createdById?: string;
}
