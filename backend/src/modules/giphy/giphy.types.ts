/// "gifs" y "stickers" son namespaces separados en la API de Giphy
/// (/v1/gifs/* vs /v1/stickers/*) — mismo shape de respuesta, contenido
/// distinto (los stickers vienen pensados para fondo transparente).
export type GiphyMediaKind = "gifs" | "stickers";

/// Forma pública recortada de un resultado de Giphy — nunca se reenvía el
/// JSON crudo de Giphy al cliente (trae decenas de renditions/metadata que
/// no usamos). `previewUrl` es la rendition animada liviana para la grilla
/// del picker; `originalUrl` es la rendition de calidad completa que
/// `POST /import` termina descargando si el usuario elige este resultado —
/// viene de la misma respuesta de Giphy que ya trajo `previewUrl` (el
/// servidor ya la validó al pedirla), así que devolvérsela al cliente para
/// que la mande de vuelta en `POST /import` no reintroduce el problema de
/// "confiar en una URL del cliente": `importGiphyAsset` igual revalida que
/// el hostname sea de Giphy antes de descargar (ver giphy.service.ts).
export interface GiphySearchResult {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
  width: number;
  height: number;
}

export interface SearchGiphyOptions {
  limit?: number;
  offset?: number;
}

export interface GetTrendingGiphyOptions {
  limit?: number;
}
