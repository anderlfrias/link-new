/**
 * Mismo criterio que `backend/src/constants/allowed-file-types.constant.ts` — el
 * backend sigue siendo la única fuente de verdad y quien realmente valida.
 * Esto es solo para que el selector nativo de archivos ya filtre por tipo,
 * en vez de dejar que el usuario elija algo que el backend va a rechazar.
 */
export const ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
].join(",");
