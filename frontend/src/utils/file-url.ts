import { env } from "@/lib/env";

/** `env.apiUrl` es `.../api`, pero los archivos se sirven en la raíz del backend (ver backend/API.md sección 9). */
const BACKEND_ORIGIN = new URL(env.apiUrl).origin;

/**
 * Resuelve la URL pública para el avatar de un usuario o grupo.
 * Prioriza `avatarFileId` usando el endpoint público `/api/v1/files/:id/content` (§5.3, §12.1),
 * con fallback a `avatarFile.path` para compatibilidad transitoria.
 */
export function getAvatarUrl(userOrGroup: {
  avatarFileId?: string | null;
  imageFileId?: string | null;
  avatarFile?: { path?: string } | null;
  imageFile?: { path?: string } | null;
}): string | null {
  const fileId = userOrGroup.avatarFileId ?? userOrGroup.imageFileId;
  if (fileId) {
    return buildUploadedFileUrl(`/api/v1/files/${fileId}/content`);
  }
  const path = userOrGroup.avatarFile?.path ?? userOrGroup.imageFile?.path;
  if (path) {
    return buildStoredFileUrl(path);
  }
  return null;
}

/** `true` si `url` apunta a un archivo servido por este backend. Una tarjeta de contacto vieja
 * guardaba la URL de la foto que mandó el cliente: cargar una de otro sitio le avisaba a ese sitio
 * quién leía el mensaje y cuándo. */
export function isBackendFileUrl(url: string): boolean {
  return url.startsWith(`${BACKEND_ORIGIN}/api/v1/files/`);
}

/**
 * Resuelve la URL absoluta para un archivo, priorizando la URL firmada del backend (`file.url`)
 * o usando `buildStoredFileUrl(file.path)` como fallback transitorio.
 */
export function resolveFileUrl(file: { url?: string; path?: string }): string {
  if (file.url) {
    return buildUploadedFileUrl(file.url);
  }
  if (file.path) {
    return `${BACKEND_ORIGIN}/uploads/${file.path}`;
  }
  return "";
}

/** A partir del `path` crudo de un `StoredFile` embebido en un mensaje (sin `/uploads/`). */
export function buildStoredFileUrl(path: string): string {
  return `${BACKEND_ORIGIN}/uploads/${path}`;
}

/** A partir de la `url` relativa que devuelve la API (empieza con `/api/v1/files/...` o `/uploads/...`). */
export function buildUploadedFileUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${BACKEND_ORIGIN}${cleanUrl}`;
}
