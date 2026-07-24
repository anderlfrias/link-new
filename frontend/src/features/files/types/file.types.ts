/** Ver backend/API.md, sección 9 (Adjuntos). */

export type FileProvider = "LOCAL";

/** Forma devuelta por POST/GET/DELETE /api/v1/files. */
export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  /** Relativa al host del backend, ej. "/uploads/chat/....jpg". */
  url: string;
  createdAt: string;
}

/** Forma de `files[].file` embebida dentro de un mensaje (ver message.types.ts). */
export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  path: string;
  extension: string;
  size: number;
  provider: FileProvider;
  checksum: string | null;
  createdById: string;
  createdAt: string;
  deletedAt: string | null;
}
