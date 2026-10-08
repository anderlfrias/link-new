/// Tipo real de un archivo, según los primeros bytes ("firma" o "magic number").
///
/// Por qué existe: el tipo MIME de una subida lo declara el cliente. Con solo
/// eso, la lista de tipos permitidos o bloqueados que configura un admin se
/// evade declarando otro tipo (un `.exe` declarado como `application/pdf` pasa
/// una blocklist de ejecutables). Esto no cambia el `mimeType` que se guarda
/// ni cómo se sirve el archivo (eso ya está acotado: solo ciertos tipos van
/// inline, y siempre con `nosniff`); solo da un segundo dato para aplicar la
/// restricción de tipos (ver `assertFileTypeAllowed` en file.service.ts).
///
/// Sin dependencias a propósito (`file-type` es solo ESM y el backend compila a
/// CommonJS). Cubre los formatos más comunes y los ejecutables; lo que no
/// reconoce devuelve `null` y se evalúa solo el tipo declarado. Los formatos de
/// texto (CSV, TXT, JSON, scripts `.bat`/`.ps1`/`.sh`) no tienen firma: para
/// ellos la restricción sigue siendo declarativa.

/// Cuántos bytes hacen falta para reconocer cualquier firma de la tabla.
export const SIGNATURE_BYTES = 4100;

const MIME = {
  exe: "application/x-msdownload",
  elf: "application/x-elf",
  macho: "application/x-mach-binary",
  zip: "application/zip",
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "application/ogg",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  gzip: "application/gzip",
  sevenZip: "application/x-7z-compressed",
  rar: "application/vnd.rar",
} as const;

function startsWith(head: Buffer, bytes: number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => head[offset + index] === byte);
}

function asciiAt(head: Buffer, text: string, offset: number): boolean {
  return startsWith(head, Array.from(text, (char) => char.charCodeAt(0)), offset);
}

/// Tipo MIME según la firma de `head` (los primeros bytes del archivo), o `null`
/// si no coincide con ninguna conocida.
export function detectMimeFromSignature(head: Buffer): string | null {
  // Ejecutables.
  if (asciiAt(head, "MZ", 0)) return MIME.exe;
  if (startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return MIME.elf;
  if (
    startsWith(head, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(head, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(head, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return MIME.macho;
  }

  // Imágenes.
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return MIME.jpeg;
  if (asciiAt(head, "GIF87a", 0) || asciiAt(head, "GIF89a", 0)) return MIME.gif;

  // RIFF: WebP y WAV comparten el contenedor, los distingue el tipo en el byte 8.
  if (asciiAt(head, "RIFF", 0)) {
    if (asciiAt(head, "WEBP", 8)) return MIME.webp;
    if (asciiAt(head, "WAVE", 8)) return MIME.wav;
    return null;
  }

  // Documentos y comprimidos.
  if (asciiAt(head, "%PDF-", 0)) return MIME.pdf;
  if (
    startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(head, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(head, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return MIME.zip;
  }
  if (startsWith(head, [0x1f, 0x8b])) return MIME.gzip;
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return MIME.sevenZip;
  if (asciiAt(head, "Rar!", 0) && startsWith(head, [0x1a, 0x07], 4)) return MIME.rar;

  // Audio y video.
  if (asciiAt(head, "ftyp", 4)) return MIME.mp4;
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return MIME.webm;
  if (asciiAt(head, "OggS", 0)) return MIME.ogg;
  if (asciiAt(head, "fLaC", 0)) return MIME.flac;
  if (asciiAt(head, "ID3", 0)) return MIME.mp3;
  // Sincronía de frame MPEG: 11 bits en 1 y capa distinta de 00 (con 00 es AAC ADTS, que no se reconoce).
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0) {
    return MIME.mp3;
  }

  return null;
}

/// Tipos que son el mismo contenedor que el detectado: `.docx`, `.odt`, `.jar` y
/// `.epub` son ZIP; `.m4a`, `.mov` y las fotos HEIC/AVIF son ISO-BMFF (`ftyp`);
/// `.mkv` y WebM son Matroska; etc. Sin esto, un archivo legítimo declarado con
/// su tipo específico se vería como una mentira.
const COMPATIBLE_DECLARED: Record<string, (declared: string) => boolean> = {
  [MIME.zip]: (d) =>
    [
      "application/x-zip-compressed",
      "application/java-archive",
      "application/epub+zip",
      "application/vnd.android.package-archive",
    ].includes(d) ||
    d.startsWith("application/vnd.openxmlformats-") ||
    d.startsWith("application/vnd.oasis.opendocument."),
  [MIME.mp4]: (d) =>
    [
      "audio/mp4",
      "audio/x-m4a",
      "audio/m4a",
      "video/quicktime",
      "video/x-m4v",
      "application/mp4",
      "video/3gpp",
      "video/3gpp2",
      "audio/3gpp",
      "image/heic",
      "image/heif",
      "image/avif",
    ].includes(d),
  [MIME.webm]: (d) =>
    ["audio/webm", "video/x-matroska", "audio/x-matroska", "video/mkv"].includes(d),
  [MIME.ogg]: (d) => ["audio/ogg", "video/ogg", "audio/opus"].includes(d),
  [MIME.wav]: (d) => ["audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(d),
  [MIME.mp3]: (d) => ["audio/mp3", "audio/x-mpeg", "audio/mpeg3"].includes(d),
  [MIME.jpeg]: (d) => ["image/jpg", "image/pjpeg"].includes(d),
  [MIME.pdf]: (d) => d === "application/x-pdf",
  [MIME.flac]: (d) => d === "audio/x-flac",
  [MIME.gzip]: (d) => ["application/x-gzip"].includes(d),
  [MIME.rar]: (d) => ["application/x-rar-compressed", "application/x-rar"].includes(d),
  [MIME.exe]: (d) =>
    [
      "application/vnd.microsoft.portable-executable",
      "application/x-dosexec",
      "application/x-msdos-program",
      "application/x-ms-dos-executable",
    ].includes(d),
};

/// Sin parámetros (`audio/webm;codecs=opus` → `audio/webm`) y en minúsculas.
function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/// `true` si el tipo declarado por el cliente es coherente con el detectado: el
/// mismo tipo (ignorando parámetros) o uno de la misma familia de contenedor.
export function areCompatible(declared: string, detected: string): boolean {
  const declaredBase = baseMime(declared);
  const detectedBase = baseMime(detected);
  if (declaredBase === detectedBase) return true;
  return COMPATIBLE_DECLARED[detectedBase]?.(declaredBase) ?? false;
}

/// Imágenes que un avatar puede ser de verdad.
export const AVATAR_IMAGE_MIME_TYPES: readonly string[] = [MIME.png, MIME.jpeg, MIME.gif, MIME.webp];
