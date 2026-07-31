/** Presets por caso de uso — un avatar/foto de grupo se muestra siempre chico
 * (`Avatar` tope "xl" = 96px), un adjunto de mensaje se puede ver a pantalla
 * completa en el lightbox, por eso permite más resolución. */
export const IMAGE_COMPRESSION_PRESETS = {
  avatar: { maxDimension: 512, quality: 0.85 },
  message: { maxDimension: 1920, quality: 0.8 },
} as const;

interface CompressImageOptions {
  maxDimension: number;
  quality: number;
}

/** GIF: comprimir pasaría por <canvas> y solo capturaría un frame, perdiendo
 * la animación. SVG: es vectorial, rasterizarlo lo único que hace es
 * empeorarlo. Ninguno de los dos se toca. */
function shouldCompress(mimeType: string): boolean {
  return mimeType.startsWith("image/") && mimeType !== "image/gif" && mimeType !== "image/svg+xml";
}

/**
 * Comprime una imagen a WebP antes de subirla (avatar, foto de grupo, o
 * adjunto de mensaje) — redimensiona al máximo indicado (mantiene aspect
 * ratio, nunca agranda una imagen más chica) y recodifica con la calidad
 * indicada. Si algo falla, o el resultado termina más pesado que el
 * original (pasa con imágenes ya chicas/simples), devuelve el archivo
 * original tal cual — nunca bloquea la subida por esto.
 */
export async function compressImage(file: Blob, filename: string, options: CompressImageOptions): Promise<File> {
  const original = file instanceof File ? file : new File([file], filename, { type: file.type });

  if (!shouldCompress(file.type)) return original;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, options.maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return original;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const compressedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", options.quality),
      );
      if (!compressedBlob || compressedBlob.size >= original.size) return original;

      const webpName = `${filename.replace(/\.[^./\\]+$/, "")}.webp`;
      return new File([compressedBlob], webpName, { type: "image/webp" });
    } finally {
      bitmap.close();
    }
  } catch {
    // Formato que `createImageBitmap` no soporta, canvas "tainted", etc. —
    // mejor subir el original sin comprimir que romper el flujo de subida.
    return original;
  }
}
