/** Alias de extensión → mime pattern(s) reales, SOLO para resolver lo que el admin escribe en
 * `FileTypeMultiSelect` (nunca se manda al backend una extensión — `AppSettings.fileTypeList`
 * sigue siendo siempre mime types, validados por `settings.validator.ts`). Sin esto, escribir
 * ".pdf" o ".exe" cae en el mismo bug que motivó este picker: una extensión nunca matchea contra
 * `upload.mimetype` en `file.service.ts`.
 *
 * Deliberadamente conservador: solo mapea extensiones cuyo mime type real es conocido y estable.
 * Algunos binarios (`.bat`, `.msi`, `.dmg`) suelen llegar del navegador como el genérico
 * `"application/octet-stream"` en vez de un mime específico — no están acá para no prometer una
 * cobertura que en la práctica no se cumple; si un admin necesita bloquear/permitir binarios
 * desconocidos en general, tiene que agregar `application/octet-stream` a mano (el "?" del picker
 * lo menciona). */
export const FILE_TYPE_EXTENSION_ALIASES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  zip: ["application/zip"],
  rar: ["application/vnd.rar"],
  "7z": ["application/x-7z-compressed"],
  txt: ["text/plain"],
  csv: ["text/csv"],
  json: ["application/json"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  mp3: ["audio/mpeg"],
  wav: ["audio/wav"],
  ogg: ["audio/ogg"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mov: ["video/quicktime"],
  avi: ["video/x-msvideo"],
  exe: ["application/x-msdownload", "application/vnd.microsoft.portable-executable"],
  apk: ["application/vnd.android.package-archive"],
  sh: ["application/x-sh"],
  jar: ["application/java-archive"],
};
