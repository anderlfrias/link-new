import { env } from "@/lib/env";

/** `env.apiUrl` es `.../api`, pero los archivos se sirven en la raíz del backend (ver backend/API.md sección 9). */
const BACKEND_ORIGIN = new URL(env.apiUrl).origin;

/** A partir del `path` crudo de un `StoredFile` embebido en un mensaje (sin `/uploads/`). */
export function buildStoredFileUrl(path: string): string {
  return `${BACKEND_ORIGIN}/uploads/${path}`;
}

/** A partir de la `url` ya relativa que devuelve `POST/GET /api/v1/files` (empieza con `/uploads/...`). */
export function buildUploadedFileUrl(url: string): string {
  return `${BACKEND_ORIGIN}${url}`;
}
