/// Categorías curadas para `AppSettings.fileTypeList` (ver settings/README.md,
/// `file.service.ts#uploadFile`) — el panel de admin las usa para armar la
/// lista como checkboxes en vez de que el admin tipee mime types a mano.
/// Motivo: un valor mal escrito (ej. la extensión ".pdf" en vez del mime type
/// "application/pdf") nunca matchea contra `upload.mimetype`, y el
/// allowlist/blocklist queda roto en silencio — un ALLOWLIST con esa entrada
/// bloquea absolutamente todo, un BLOCKLIST con esa entrada no bloquea nada.
/// `audio`/`video` usan un patrón wildcard (`"audio/*"`) porque hay demasiados
/// mime types de contenedor distintos para listarlos uno por uno — ver
/// `matchesFileTypePattern` en `file.service.ts`, que sí sabe interpretar el "*".
export interface FileTypeCategory {
  id: string;
  label: string;
  patterns: string[];
}

export const FILE_TYPE_CATEGORIES: FileTypeCategory[] = [
  { id: "images", label: "Imágenes", patterns: ["image/jpeg", "image/png", "image/gif", "image/webp"] },
  { id: "pdf", label: "PDF", patterns: ["application/pdf"] },
  {
    id: "word",
    label: "Documentos de Word",
    patterns: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  {
    id: "excel",
    label: "Hojas de cálculo de Excel",
    patterns: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  { id: "zip", label: "Archivos comprimidos (ZIP)", patterns: ["application/zip"] },
  { id: "text", label: "Texto plano", patterns: ["text/plain"] },
  { id: "audio", label: "Audio", patterns: ["audio/*"] },
  { id: "video", label: "Video", patterns: ["video/*"] },
  {
    id: "executables",
    label: "Ejecutables",
    patterns: [
      "application/x-msdownload",
      "application/vnd.microsoft.portable-executable",
      "application/x-executable",
      "application/x-elf",
      "application/x-mach-binary",
      "application/vnd.android.package-archive",
      "application/x-sh",
    ],
  },
];
