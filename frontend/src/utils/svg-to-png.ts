/**
 * Rasteriza un `<svg>` ya renderizado en el DOM (ej. un avatar de Boring
 * Avatars) a un Blob PNG, para poder subirlo por el mismo endpoint que una
 * foto real. Boring Avatars solo existe como componente React (SVG) — no hay
 * forma de generarlo del lado del servidor sin duplicar su algoritmo, así que
 * la rasterización se hace acá, en el navegador, con un <canvas> descartable.
 */
export async function svgElementToPngBlob(svg: SVGSVGElement, size = 256): Promise<Blob> {
  const svgString = new XMLSerializer().serializeToString(svg);
  const svgUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo cargar el SVG para rasterizarlo"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");
    ctx.drawImage(image, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar el PNG");
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
