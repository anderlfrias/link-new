/// Ya NO es un allowlist para adjuntos de mensaje — esos aceptan cualquier
/// tipo de archivo (ver `file.service.ts`, `uploadFile`). Este mapa sobrevive
/// para dos cosas nada más: (1) el gate de avatar/foto de grupo en
/// `auth.route.ts` (`image/*` + acá adentro — un avatar sí debe ser una
/// imagen conocida), y (2) el respaldo de extensión en `safeExtension`
/// (`modules/files/file.service.ts`) cuando el nombre original no trae una
/// extensión reconocible — para el resto de los tipos, la extensión sale
/// directo del nombre del archivo, no hace falta que estén listados acá.
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
