/** El atributo `download` de un <a> se ignora si el `href` es de otro origin
 * (backend en :4000, frontend en :3000) — el navegador termina navegando o
 * abriendo una pestaña nueva en vez de bajar el archivo. Traerlo como blob y
 * descargar ESE object URL (siempre mismo origin, "blob:") sí respeta
 * `download` sin importar de dónde vino el archivo originalmente.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
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
    // Si falla el fetch (red, CORS inesperado), al menos dejamos ver/guardar
    // el archivo a mano en vez de que el click no haga nada.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
