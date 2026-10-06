import type { Style } from "@dicebear/core";

/// Créditos de un estilo de DiceBear cuya licencia exige atribución.
export interface DiceBearAttribution {
  title: string;
  creator: string;
  source: string;
  licenseName: string;
  licenseUrl: string;
}

/// Devuelve los créditos de un estilo si su licencia exige atribución (CC BY,
/// por ejemplo CC BY 4.0), o `null` si no la exige: CC0, y los de uso libre
/// propio como avataaars/bottts. Se leen de los metadatos que publica cada
/// paquete de estilo (`style.meta`), así el crédito sigue siendo correcto si
/// DiceBear cambia la licencia o el autor de un estilo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDiceBearAttribution(style: Style<any>): DiceBearAttribution | null {
  const meta = style.meta;
  const licenseName = meta?.license?.name;
  if (!meta || !licenseName || !/^CC BY\b/.test(licenseName)) return null;

  return {
    title: meta.title ?? "",
    creator: meta.creator ?? "",
    source: meta.source ?? meta.homepage ?? "",
    licenseName,
    licenseUrl: meta.license?.url ?? "",
  };
}
