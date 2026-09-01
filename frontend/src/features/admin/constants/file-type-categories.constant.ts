/** Espejo de `FILE_TYPE_CATEGORIES` (backend/src/constants/file-type-categories.constant.ts).
 * El panel de admin arma `fileTypeList` eligiendo estas categorías como checkboxes en vez de
 * tipear mime types a mano — un valor mal escrito (ej. la extensión ".pdf" en vez del mime type
 * "application/pdf") nunca matchea contra el mime type real del archivo subido, y deja el
 * allowlist/blocklist roto en silencio (ALLOWLIST bloquea todo, BLOCKLIST no bloquea nada). */
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
