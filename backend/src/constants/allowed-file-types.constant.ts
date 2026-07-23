/// Tipos MIME que este sistema acepta como adjunto (avatar, imagen de
/// conversación, adjunto de mensaje — el mismo `StoredFile` sirve a los tres,
/// ver backend/README.md "Gestión de Archivos"). La extensión de cada entrada
/// es el respaldo cuando el nombre original no trae una extensión reconocible
/// (ver `safeExtension` en `modules/files/file.service.ts`).
export const ALLOWED_MIME_TYPES: Record<string, { extension: string }> = {
  "image/jpeg": { extension: "jpg" },
  "image/png": { extension: "png" },
  "image/gif": { extension: "gif" },
  "image/webp": { extension: "webp" },
  "application/pdf": { extension: "pdf" },
  "text/plain": { extension: "txt" },
  "application/msword": { extension: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: "docx" },
  "application/vnd.ms-excel": { extension: "xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: "xlsx" },
  "application/zip": { extension: "zip" },
};
