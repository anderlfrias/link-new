const UNITS = ["B", "KB", "MB", "GB"];

/** "245678" -> "240 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unitIndex]}`;
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith("audio/");
}
