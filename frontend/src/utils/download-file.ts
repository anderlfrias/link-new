/** Construye la URL de descarga streaming agregando ?download=1 a los endpoints de /files/:id/content (§4.5). */
export function buildDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (parsed.pathname.includes("/files/") && parsed.pathname.endsWith("/content")) {
      parsed.searchParams.set("download", "1");
      return parsed.toString();
    }
  } catch {
    // Si la URL no es parseable directamente, intentamos manipularla como string
    if (url.includes("/files/") && url.includes("/content")) {
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}download=1`;
    }
  }
  return url;
}

/**
 * Descarga streaming nativa en el navegador (§4.5, §5.5).
 * Para endpoints de `/files/:id/content`, usa un `<a>` con `download=1` que le indica al backend
 * responder con `Content-Disposition: attachment`, descargando por streaming nativo del navegador
 * sin bufferizar todo el archivo en memoria ni causar crash en archivos grandes.
 * Para URLs externas que no pertenecen a files, intenta descarga directa vía anchor tag o fallback.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const downloadUrl = buildDownloadUrl(url);

  // Si es un archivo de nuestra API de files, disparamos la descarga nativa directa sin bufferizar
  if (downloadUrl.includes("/files/") && downloadUrl.includes("/content")) {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  // Fallback para URLs que no pertenecen a la API de files (ej. URLs externas o blob:)
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
