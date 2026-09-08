import { createAvatar, type Style } from "@dicebear/core";

export interface DiceBearRenderOptions {
  seed: string;
  backgroundColor?: string;
  size?: number;
  radius?: number;
}

/**
 * Genera el string SVG optimizado de un avatar DiceBear con las opciones deseadas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderDiceBearSvg(style: Style<any>, options: DiceBearRenderOptions): string {
  const { seed, backgroundColor, size, radius } = options;

  const bgArray =
    backgroundColor && backgroundColor !== "transparent"
      ? [backgroundColor.replace("#", "")]
      : undefined;

  const avatar = createAvatar(style, {
    seed,
    backgroundColor: bgArray,
    size,
    radius,
  });

  return avatar.toString();
}

/**
 * Genera un Data URI del avatar en formato SVG para usar directamente en `<img src="...">`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderDiceBearDataUri(style: Style<any>, options: DiceBearRenderOptions): string {
  const { seed, backgroundColor, size, radius } = options;

  const bgArray =
    backgroundColor && backgroundColor !== "transparent"
      ? [backgroundColor.replace("#", "")]
      : undefined;

  const avatar = createAvatar(style, {
    seed,
    backgroundColor: bgArray,
    size,
    radius,
  });

  return avatar.toDataUri();
}

/**
 * Rasteriza un string SVG a un Blob PNG con la resolución requerida (por defecto 256px),
 * listo para ser enviado a través del hook useUpdateProfilePicture.
 */
export async function svgStringToPngBlob(svgString: string, size = 256): Promise<Blob> {
  // Aseguramos que el SVG tenga width y height explícitos para renderizado consistente en Canvas
  let normalizedSvg = svgString;
  if (!normalizedSvg.includes(`width="`)) {
    normalizedSvg = normalizedSvg.replace("<svg", `<svg width="${size}" height="${size}"`);
  }

  const svgBlob = new Blob([normalizedSvg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

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

    // Limpiar canvas
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);

    const resultBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!resultBlob) throw new Error("No se pudo generar el PNG a partir del SVG");
    return resultBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
