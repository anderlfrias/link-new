/**
 * Utilidades para interactuar con el portapapeles del navegador (texto e imágenes).
 */

/**
 * Convierte un Blob de cualquier formato de imagen (JPEG, WebP, GIF, etc.) a PNG.
 * La API estándar del portapapeles (`navigator.clipboard.write`) exige obligatoriamente
 * el tipo MIME `image/png` en la gran mayoría de navegadores (Chrome, Firefox, Safari, Edge).
 */
export async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  // En navegadores modernos preferimos createImageBitmap por rendimiento y evitar el DOM
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          if (pngBlob) return pngBlob;
        }
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Si falla o no se soporta el formato vía bitmap, continuar al fallback con <img>
    }
  }

  // Fallback con elemento <img> y <canvas>
  return new Promise<Blob>((resolve, reject) => {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      reject(new Error("Entorno sin soporte de DOM para conversión de imágenes"));
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo obtener el contexto 2D del canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("No se pudo exportar el canvas a image/png"));
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    img.src = objectUrl;
  });
}

/**
 * Copia texto plano al portapapeles.
 * Usa `navigator.clipboard.writeText` con fallback a `document.execCommand('copy')`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback si la API de clipboard rechaza el permiso o falla
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Descarga una imagen desde una URL o ruta, la convierte a PNG si es necesario,
 * y la escribe al portapapeles como `image/png`.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
  if (!imageUrl) return false;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Error al obtener la imagen (${response.status})`);
    }

    const rawBlob = await response.blob();
    const pngBlob = await convertImageBlobToPng(rawBlob);

    if (typeof navigator !== "undefined" && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ]);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error al copiar imagen al portapapeles:", error);
    return false;
  }
}

/**
 * Normaliza el archivo de imagen pegado asegurando que tenga un nombre válido
 * con su extensión correspondiente según el tipo MIME.
 */
function normalizePastedImageFile(file: File): File {
  if (file.name && /\.[a-zA-Z0-9]+$/.test(file.name) && file.name !== "blob") {
    return file;
  }

  const mimeSubtype = file.type.split("/")[1] || "png";
  const extension = mimeSubtype === "jpeg" ? "jpg" : mimeSubtype;
  const baseName = !file.name || file.name === "blob" ? "imagen" : file.name;
  const finalName = `${baseName}.${extension}`;

  return new File([file], finalName, { type: file.type, lastModified: file.lastModified || Date.now() });
}

/**
 * Extrae archivos de imagen desde los datos de un evento del portapapeles (`ClipboardEvent.clipboardData`).
 * Soporta tanto `items` (DataTransferItemList de la API estándar) como `files` (FileList).
 * Si no contiene imágenes (por ejemplo texto plano o HTML), devuelve un array vacío para no interferir
 * con el pegado normal de texto del navegador.
 */
export function extractImageFilesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];

  const imageFiles: File[] = [];

  // 1. Revisar items de DataTransfer (captura imágenes copiadas directamente como bitmap/screenshot)
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(normalizePastedImageFile(file));
        }
      }
    }
  }

  // 2. Si no hubo en items, revisar files (ej. archivos de imagen copiados desde el explorador del sistema)
  if (imageFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.type.startsWith("image/")) {
        imageFiles.push(normalizePastedImageFile(file));
      }
    }
  }

  return imageFiles;
}

