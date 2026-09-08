/** Espejo de `GiphyMediaKind` (backend/src/modules/giphy/giphy.types.ts). */
export type GiphyMediaKind = "gifs" | "stickers";

/** Espejo de `GiphySearchResult` — forma recortada, nunca el JSON crudo de
 * Giphy (ver backend/src/modules/giphy/README.md). `previewUrl` es solo para
 * la grilla del picker; `originalUrl` es la que hay que mandar de vuelta a
 * `POST /import` si se elige este resultado (el backend la revalida antes
 * de descargar, ver giphy.service.ts#isGiphyCdnUrl). */
export interface GiphySearchResult {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width: number;
  height: number;
}
